package model

import (
	"errors"
	"io"
	"os"
	"strings"
	"sync"
	"time"

	pty "github.com/aymanbagabas/go-pty"
	"github.com/lonelyor/sourceflow/kernel/util"
	"github.com/lonelyor/sourceflow/third_party/go/logging"
	"github.com/olahol/melody"
)

type AssistantTerminalRuntime struct {
	Session  *AssistantTerminalSession
	PTY      pty.Pty
	Cmd      *pty.Cmd
	Attached *melody.Session

	mu      sync.RWMutex
	closed  bool
	started time.Time
	done    chan struct{}
	cleanup sync.Once
}

type AssistantTerminalEvent struct {
	SessionID string `json:"sessionId"`
	Status    string `json:"status,omitempty"`
	Output    string `json:"output,omitempty"`
	Width     int    `json:"width,omitempty"`
	Height    int    `json:"height,omitempty"`
	ExitCode  int    `json:"exitCode,omitempty"`
	Title     string `json:"title,omitempty"`
}

var assistantTerminalRuntimes sync.Map

func OpenAssistantTerminalRuntime(sessionID string, width, height int, attached *melody.Session) (ret *AssistantTerminalSession, err error) {
	session, err := GetAssistantTerminalSession(sessionID)
	if err != nil {
		return nil, err
	}
	if existing, ok := assistantTerminalRuntimes.Load(session.ID); ok {
		runtime := existing.(*AssistantTerminalRuntime)
		runtime.Attach(attached)
		if 0 < width && 0 < height {
			_ = runtime.Resize(width, height)
		}
		emitAssistantTerminalEvent(attached, "assistantTerminalReady", &AssistantTerminalEvent{SessionID: session.ID, Status: session.Status, Width: width, Height: height, Title: session.Title})
		return session, nil
	}

	pseudo, err := pty.New()
	if err != nil {
		return nil, err
	}
	if 0 < width && 0 < height {
		_ = pseudo.Resize(width, height)
	}

	cmd := pseudo.Command(session.Shell, session.Args...)
	cmd.Dir = normalizeAssistantTerminalCwd(session.Cwd)
	cmd.Env = os.Environ()

	if err = cmd.Start(); err != nil {
		_ = pseudo.Close()
		return nil, err
	}

	runtime := &AssistantTerminalRuntime{
		Session:  session,
		PTY:      pseudo,
		Cmd:      cmd,
		Attached: attached,
		started:  time.Now(),
		done:     make(chan struct{}),
	}
	assistantTerminalRuntimes.Store(session.ID, runtime)

	session.Status = "running"
	session.StartedAt = runtime.started.UnixMilli()
	session.UpdatedAt = session.StartedAt
	_ = UpdateAssistantTerminalSessionStatus(session.ID, session.Status, session.StartedAt, 0)

	emitAssistantTerminalEvent(attached, "assistantTerminalReady", &AssistantTerminalEvent{SessionID: session.ID, Status: session.Status, Width: width, Height: height, Title: session.Title})
	go runtime.pipeOutput()
	go runtime.wait()
	return session, nil
}

func AttachAssistantTerminalRuntime(sessionID string, attached *melody.Session) bool {
	if existing, ok := assistantTerminalRuntimes.Load(strings.TrimSpace(sessionID)); ok {
		existing.(*AssistantTerminalRuntime).Attach(attached)
		return true
	}
	return false
}

func InputAssistantTerminalRuntime(sessionID, data, commandText string) (err error) {
	runtime, err := getAssistantTerminalRuntime(sessionID)
	if err != nil {
		return err
	}
	if "" != strings.TrimSpace(commandText) {
		_ = RecordAssistantTerminalCommand(sessionID, commandText)
	}
	_, err = runtime.PTY.Write([]byte(data))
	return err
}

func ResizeAssistantTerminalRuntime(sessionID string, width, height int) (err error) {
	runtime, err := getAssistantTerminalRuntime(sessionID)
	if err != nil {
		return err
	}
	if err = runtime.Resize(width, height); err != nil {
		return err
	}
	runtime.emit("assistantTerminalResize", &AssistantTerminalEvent{SessionID: sessionID, Width: width, Height: height})
	return nil
}

func CloseAssistantTerminalRuntime(sessionID string) (err error) {
	runtime, err := getAssistantTerminalRuntime(sessionID)
	if err != nil {
		return err
	}
	return runtime.Close()
}

func (runtime *AssistantTerminalRuntime) Attach(session *melody.Session) {
	runtime.mu.Lock()
	defer runtime.mu.Unlock()
	runtime.Attached = session
}

func (runtime *AssistantTerminalRuntime) Resize(width, height int) error {
	if 1 > width || 1 > height {
		return nil
	}
	return runtime.PTY.Resize(width, height)
}

func (runtime *AssistantTerminalRuntime) Close() (err error) {
	runtime.mu.Lock()
	if runtime.closed {
		runtime.mu.Unlock()
		return nil
	}
	runtime.closed = true
	runtime.mu.Unlock()

	_ = UpdateAssistantTerminalSessionStatus(runtime.Session.ID, "closing", runtime.Session.StartedAt, 0)
	if nil != runtime.Cmd && nil != runtime.Cmd.Process {
		err = runtime.Cmd.Process.Kill()
		if nil != err && !errors.Is(err, os.ErrProcessDone) {
			return err
		}
	}
	return nil
}

func (runtime *AssistantTerminalRuntime) pipeOutput() {
	buffer := make([]byte, 8192)
	for {
		n, err := runtime.PTY.Read(buffer)
		if 0 < n {
			runtime.emit("assistantTerminalOutput", &AssistantTerminalEvent{SessionID: runtime.Session.ID, Output: string(buffer[:n])})
		}
		if err != nil {
			if err != io.EOF && !isAssistantTerminalClosedReadErr(err) {
				logging.LogWarnf("assistant terminal read [%s] failed: %s", runtime.Session.ID, err)
			}
			return
		}
	}
}

func (runtime *AssistantTerminalRuntime) wait() {
	err := runtime.Cmd.Wait()
	exitCode := 0
	if nil != runtime.Cmd.ProcessState {
		exitCode = runtime.Cmd.ProcessState.ExitCode()
	}
	if nil != err && exitCode == 0 {
		exitCode = 1
	}

	status := "exited"
	runtime.mu.RLock()
	if runtime.closed {
		status = "closed"
	}
	runtime.mu.RUnlock()
	runtime.finish(status, exitCode)
}

func (runtime *AssistantTerminalRuntime) emit(cmd string, data *AssistantTerminalEvent) {
	runtime.mu.RLock()
	attached := runtime.Attached
	runtime.mu.RUnlock()
	emitAssistantTerminalEvent(attached, cmd, data)
}

func (runtime *AssistantTerminalRuntime) finish(status string, exitCode int) {
	runtime.cleanup.Do(func() {
		if nil != runtime.PTY {
			_ = runtime.PTY.Close()
		}
		assistantTerminalRuntimes.Delete(runtime.Session.ID)
		endedAt := time.Now().UnixMilli()
		_ = UpdateAssistantTerminalSessionStatus(runtime.Session.ID, status, runtime.Session.StartedAt, endedAt)
		runtime.emit("assistantTerminalExit", &AssistantTerminalEvent{
			SessionID: runtime.Session.ID,
			Status:    status,
			ExitCode:  exitCode,
		})
		close(runtime.done)
	})
}

func getAssistantTerminalRuntime(sessionID string) (ret *AssistantTerminalRuntime, err error) {
	if runtime, ok := assistantTerminalRuntimes.Load(strings.TrimSpace(sessionID)); ok {
		return runtime.(*AssistantTerminalRuntime), nil
	}
	return nil, os.ErrNotExist
}

func emitAssistantTerminalEvent(session *melody.Session, cmd string, data *AssistantTerminalEvent) {
	if nil == session {
		return
	}
	result := util.NewCmdResult(cmd, 0, util.PushModeSingleSelf)
	if appID, ok := session.Get("app"); ok {
		result.AppId = appID.(string)
	}
	if sid, ok := session.Get("id"); ok {
		result.SessionId = sid.(string)
	}
	result.Data = data
	if err := session.Write(result.Bytes()); err != nil {
		logging.LogWarnf("assistant terminal write event [%s] failed: %s", cmd, err)
	}
}

func isAssistantTerminalClosedReadErr(err error) bool {
	if nil == err {
		return false
	}
	msg := strings.ToLower(err.Error())
	return strings.Contains(msg, "file already closed") || strings.Contains(msg, "closed pipe") || strings.Contains(msg, "handle is invalid")
}
