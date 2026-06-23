// SourceFlow - Make knowledge flow
// Copyright (c) 2020-present, b3log.org
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program.  If not, see <https://www.gnu.org/licenses/>.

package logging

import (
	"bytes"
	"fmt"
	"io"
	stdlog "log"
	"os"
	"path/filepath"
	"runtime"
	"runtime/debug"
	"strings"
	"sync"

	"github.com/lonelyor/sourceflow/third_party/go/gulu"
)

const (
	ExitCodeUnavailableDatabase = 20 // 不可用的数据库
	ExitCodeUnavailablePort     = 21 // 不可用的端口
	ExitCodeSecurityRisk        = 22 // 存在安全风险
	ExitCodeWorkspaceLocked     = 24 // 工作空间已被锁定
	ExitCodeInitWorkspaceErr    = 25 // 初始化工作空间失败
	ExitCodeFileSysErr          = 26 // 文件系统错误
	ExitCodeOk                  = 0  // 正常退出
	ExitCodeFatal               = 1  // 致命错误
)

func ShortStack() string {
	output := string(debug.Stack())
	lines := strings.Split(output, "\n")
	if 5 < len(lines) {
		lines = lines[5:]
	}
	buf := bytes.Buffer{}
	for _, l := range lines {
		if strings.Contains(l, "gin-gonic") {
			break
		}
		buf.WriteString("    ")
		buf.WriteString(l)
		buf.WriteByte('\n')
	}
	return buf.String()
}

var (
	logger  *Logger
	logFile *os.File
	LogPath string
)

func init() {
	dir, err := os.Getwd()
	if nil != err {
		stdlog.Printf("get current dir failed: %s", err)
		dir = "./"
	}
	LogPath = filepath.Join(dir, "logging.log")
}

func SetLogPath(path string) {
	LogPath = path
}

func LogTracef(format string, v ...interface{}) {
	defer closeLogger()
	openLogger()

	if !logger.IsTraceEnabled() {
		return
	}
	logger.Tracef(format, v...)
}

func LogTrace(content string) {
	defer closeLogger()
	openLogger()

	if !logger.IsTraceEnabled() {
		return
	}
	logger.Tracef(content)
}

func LogDebugf(format string, v ...interface{}) {
	defer closeLogger()
	openLogger()

	if !logger.IsDebugEnabled() {
		return
	}
	logger.Debugf(format, v...)
}

func LogDebug(content string) {
	defer closeLogger()
	openLogger()

	if !logger.IsDebugEnabled() {
		return
	}
	logger.Debugf(content)
}

func LogInfof(format string, v ...interface{}) {
	defer closeLogger()
	openLogger()
	logger.Infof(format, v...)
}

func LogInfo(content string) {
	defer closeLogger()
	openLogger()

	if !logger.IsDebugEnabled() {
		return
	}
	logger.Infof(content)
}

func LogErrorf(format string, v ...interface{}) {
	defer closeLogger()
	openLogger()
	logger.Errorf(format, v...)
}

func LogError(content string) {
	defer closeLogger()
	openLogger()

	if !logger.IsDebugEnabled() {
		return
	}
	logger.Errorf(content)
}

func LogWarnf(format string, v ...interface{}) {
	defer closeLogger()
	openLogger()

	if !logger.IsWarnEnabled() {
		return
	}
	logger.Warnf(format, v...)
}

func LogWarn(content string) {
	defer closeLogger()
	openLogger()

	if !logger.IsWarnEnabled() {
		return
	}
	logger.Warnf(content)
}

func LogFatalf(exitCode int, format string, v ...interface{}) {
	openLogger()
	logger.Fatalf(exitCode, format, v...)
}

func LogFatal(exitCode int, content string) {
	openLogger()
	logger.Fatalf(exitCode, content)
}

var lock = sync.Mutex{}

func openLogger() {
	lock.Lock()

	if gulu.File.IsExist(LogPath) {
		if size := gulu.File.GetFileSize(LogPath); 1024*1024*32 <= size {
			// 日志文件大于 32M 的话删了重建
			os.Remove(LogPath)
		}
	}

	dir, _ := filepath.Split(LogPath)
	if !gulu.File.IsExist(dir) {
		if err := os.MkdirAll(dir, 0755); nil != err {
			stdlog.Printf("create log dir [%s] failed: %s", dir, err)
		}
	}

	var err error
	logFile, err = os.OpenFile(LogPath, os.O_RDWR|os.O_CREATE|os.O_APPEND, 0644)
	if nil != err {
		stdlog.Printf("create log file [%s] failed: %s", LogPath, err)
	}
	logger = NewLogger(io.MultiWriter(os.Stdout, logFile))
}

func closeLogger() {
	logFile.Close()
	lock.Unlock()
}

func Recover() {
	if e := recover(); nil != e {
		stack := stack()
		msg := fmt.Sprintf("PANIC RECOVERED: %v\n\t%s\n", e, stack)
		LogErrorf(msg)
	}
}

var (
	dunno     = []byte("???")
	centerDot = []byte("·")
	dot       = []byte(".")
	slash     = []byte("/")
)

// stack implements Stack, skipping 2 frames.
func stack() []byte {
	buf := &bytes.Buffer{} // the returned data
	// As we loop, we open files and read them. These variables record the currently
	// loaded file.
	var lines [][]byte
	var lastFile string
	for i := 2; ; i++ { // Caller we care about is the user, 2 frames up
		pc, file, line, ok := runtime.Caller(i)
		if !ok {
			break
		}
		// Print this much at least.  If we can't find the source, it won't show.
		fmt.Fprintf(buf, "%s:%d (0x%x)\n", file, line, pc)
		if file != lastFile {
			data, err := os.ReadFile(file)
			if err != nil {
				continue
			}
			lines = bytes.Split(data, []byte{'\n'})
			lastFile = file
		}
		line-- // in stack trace, lines are 1-indexed but our array is 0-indexed
		fmt.Fprintf(buf, "\t%s: %s\n", function(pc), source(lines, line))
	}
	return buf.Bytes()
}

// source returns a space-trimmed slice of the n'th line.
func source(lines [][]byte, n int) []byte {
	if n < 0 || n >= len(lines) {
		return dunno
	}
	return bytes.Trim(lines[n], " \t")
}

// function returns, if possible, the name of the function containing the PC.
func function(pc uintptr) []byte {
	fn := runtime.FuncForPC(pc)
	if fn == nil {
		return dunno
	}
	name := []byte(fn.Name())
	// The name includes the path name to the package, which is unnecessary
	// since the file name is already included.  Plus, it has center dots.
	// That is, we see
	//	runtime/debug.*T·ptrmethod
	// and want
	//	*T.ptrmethod
	// Since the package path might contains dots (e.g. code.google.com/...),
	// we first remove the path prefix if there is one.
	if lastslash := bytes.LastIndex(name, slash); lastslash >= 0 {
		name = name[lastslash+1:]
	}
	if period := bytes.Index(name, dot); period >= 0 {
		name = name[period+1:]
	}
	name = bytes.Replace(name, centerDot, dot, -1)
	return name
}

// Logging level.
const (
	Off = iota
	Trace
	Debug
	Info
	Warn
	Error
	Fatal
)

// the global default logging level, it will be used for creating logger.
var logLevel = Debug

// Logger represents a simple logger with level.
// The underlying logger is the standard Go logging "log".
type Logger struct {
	level  int
	logger *stdlog.Logger
}

// NewLogger creates a logger.
func NewLogger(out io.Writer) *Logger {
	ret := &Logger{level: logLevel, logger: stdlog.New(out, "", stdlog.Ldate|stdlog.Ltime|stdlog.Lshortfile)}
	return ret
}

// SetLogLevel sets the logging level of all loggers.
func SetLogLevel(level string) {
	logLevel = getLevel(level)
}

// getLevel gets logging level int value corresponding to the specified level.
func getLevel(level string) int {
	level = strings.ToLower(level)

	switch level {
	case "off":
		return Off
	case "trace":
		return Trace
	case "debug":
		return Debug
	case "info":
		return Info
	case "warn":
		return Warn
	case "error":
		return Error
	case "fatal":
		return Fatal
	default:
		return Info
	}
}

// SetLevel sets the logging level of a logger.
func (l *Logger) SetLevel(level string) {
	l.level = getLevel(level)
}

// IsTraceEnabled determines whether the trace level is enabled.
func (l *Logger) IsTraceEnabled() bool {
	return l.level <= Trace
}

// IsDebugEnabled determines whether the debug level is enabled.
func (l *Logger) IsDebugEnabled() bool {
	return l.level <= Debug
}

// IsWarnEnabled determines whether the debug level is enabled.
func (l *Logger) IsWarnEnabled() bool {
	return l.level <= Warn
}

// Tracef prints trace level message with format.
func (l *Logger) Tracef(format string, v ...interface{}) {
	if Trace < l.level {
		return
	}

	l.logger.SetPrefix("T ")
	l.logger.Output(3, fmt.Sprintf(format, v...))
}

// Debugf prints debug level message with format.
func (l *Logger) Debugf(format string, v ...interface{}) {
	if Debug < l.level {
		return
	}

	l.logger.SetPrefix("D ")
	l.logger.Output(3, fmt.Sprintf(format, v...))
}

// Infof prints info level message with format.
func (l *Logger) Infof(format string, v ...interface{}) {
	if Info < l.level {
		return
	}

	l.logger.SetPrefix("I ")
	l.logger.Output(3, fmt.Sprintf(format, v...))
}

// Warnf prints warning level message with format.
func (l *Logger) Warnf(format string, v ...interface{}) {
	if Warn < l.level {
		return
	}

	l.logger.SetPrefix("W ")
	msg := fmt.Sprintf(format, v...)
	l.logger.Output(3, msg)
}

// Errorf prints error level message with format.
func (l *Logger) Errorf(format string, v ...interface{}) {
	if Error < l.level {
		return
	}

	l.logger.SetPrefix("E ")
	msg := fmt.Sprintf(format, v...)
	l.logger.Output(3, msg)
}

// Fatalf prints fatal level message with format and exit process with code 1.
func (l *Logger) Fatalf(exitCode int, format string, v ...interface{}) {
	if Fatal < l.level {
		return
	}

	l.logger.SetPrefix("F ")
	format += "\n%s"
	v = append(v, shortStack())
	msg := fmt.Sprintf(format, v...)
	l.logger.Output(3, msg)
	closeLogger()
	os.Exit(exitCode)
}

func shortStack() string {
	output := string(debug.Stack())
	lines := strings.Split(output, "\n")
	if 11 < len(lines) {
		lines = lines[11:]
	}
	buf := bytes.Buffer{}
	for _, l := range lines {
		if strings.Contains(l, "gin-gonic") {
			break
		}
		buf.WriteString("    ")
		buf.WriteString(l)
		buf.WriteByte('\n')
	}
	return buf.String()
}
