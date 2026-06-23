// Copyright 2013 @atotto. All rights reserved.
// Use of this source code is governed by a BSD-style
// license that can be found in the LICENSE file.

//go:build windows
// +build windows

package clipboard

import (
	"runtime"
	"syscall"
	"time"
	"unsafe"
)

const (
	cfUnicodetext = 13
	cfHDROP       = 15
	gmemMoveable  = 0x0002
)

var (
	user32                     = syscall.MustLoadDLL("user32")
	isClipboardFormatAvailable = user32.MustFindProc("IsClipboardFormatAvailable")
	openClipboard              = user32.MustFindProc("OpenClipboard")
	closeClipboard             = user32.MustFindProc("CloseClipboard")
	emptyClipboard             = user32.MustFindProc("EmptyClipboard")
	getClipboardData           = user32.MustFindProc("GetClipboardData")
	setClipboardData           = user32.MustFindProc("SetClipboardData")

	kernel32     = syscall.NewLazyDLL("kernel32")
	globalAlloc  = kernel32.NewProc("GlobalAlloc")
	globalFree   = kernel32.NewProc("GlobalFree")
	globalLock   = kernel32.NewProc("GlobalLock")
	globalUnlock = kernel32.NewProc("GlobalUnlock")
	lstrcpy      = kernel32.NewProc("lstrcpyW")

	libshell32    = syscall.NewLazyDLL("shell32.dll")
	dragQueryFile = libshell32.NewProc("DragQueryFileW")
)

func readFilePaths() (ret []string, err error) {
	ret = []string{}

	runtime.LockOSThread()
	defer runtime.UnlockOSThread()
	if formatAvailable, _, err0 := isClipboardFormatAvailable.Call(cfHDROP); formatAvailable == 0 {
		err = err0
		return
	}
	err = waitOpenClipboard()
	if err != nil {
		return
	}

	h, _, err := getClipboardData.Call(cfHDROP)
	if h == 0 {
		_, _, _ = closeClipboard.Call()
		return
	}

	l, _, err := globalLock.Call(h)
	if l == 0 {
		_, _, _ = closeClipboard.Call()
		return
	}

	count := dragQueryFile0(h, 0xFFFFFFFF, nil, 0)
	for i := uint(0); i < count; i++ {
		pLen := dragQueryFile0(h, i, nil, 0)
		buf := make([]uint16, pLen+1)
		dragQueryFile0(h, i, &buf[0], pLen+1)
		p := syscall.UTF16ToString((*[1 << 20]uint16)(unsafe.Pointer(&buf[0]))[:])
		ret = append(ret, p)
	}

	r, _, err := globalUnlock.Call(h)
	if r == 0 {
		_, _, _ = closeClipboard.Call()
		return
	}

	closed, _, err := closeClipboard.Call()
	if closed == 0 {
		return
	}
	return
}

func dragQueryFile0(hDrop uintptr, iFile uint, lpszFile *uint16, cch uint) uint {
	ret, _, _ := syscall.Syscall6(dragQueryFile.Addr(), 4,
		uintptr(hDrop),
		uintptr(iFile),
		uintptr(unsafe.Pointer(lpszFile)),
		uintptr(cch),
		0,
		0)
	return uint(ret)
}

func readAll() (string, error) {
	// LockOSThread ensure that the whole method will keep executing on the same thread from begin to end (it actually locks the goroutine thread attribution).
	// Otherwise if the goroutine switch thread during execution (which is a common practice), the OpenClipboard and CloseClipboard will happen on two different threads, and it will result in a clipboard deadlock.
	runtime.LockOSThread()
	defer runtime.UnlockOSThread()
	if formatAvailable, _, err := isClipboardFormatAvailable.Call(cfUnicodetext); formatAvailable == 0 {
		return "", err
	}
	err := waitOpenClipboard()
	if err != nil {
		return "", err
	}

	h, _, err := getClipboardData.Call(cfUnicodetext)
	if h == 0 {
		_, _, _ = closeClipboard.Call()
		return "", err
	}

	l, _, err := globalLock.Call(h)
	if l == 0 {
		_, _, _ = closeClipboard.Call()
		return "", err
	}

	text := syscall.UTF16ToString((*[1 << 20]uint16)(unsafe.Pointer(l))[:])

	r, _, err := globalUnlock.Call(h)
	if r == 0 {
		_, _, _ = closeClipboard.Call()
		return "", err
	}

	closed, _, err := closeClipboard.Call()
	if closed == 0 {
		return "", err
	}
	return text, nil
}

func writeAll(text string) error {
	// LockOSThread ensure that the whole method will keep executing on the same thread from begin to end (it actually locks the goroutine thread attribution).
	// Otherwise if the goroutine switch thread during execution (which is a common practice), the OpenClipboard and CloseClipboard will happen on two different threads, and it will result in a clipboard deadlock.
	runtime.LockOSThread()
	defer runtime.UnlockOSThread()

	err := waitOpenClipboard()
	if err != nil {
		return err
	}

	r, _, err := emptyClipboard.Call(0)
	if r == 0 {
		_, _, _ = closeClipboard.Call()
		return err
	}

	data := syscall.StringToUTF16(text)

	// "If the hMem parameter identifies a memory object, the object must have
	// been allocated using the function with the GMEM_MOVEABLE flag."
	h, _, err := globalAlloc.Call(gmemMoveable, uintptr(len(data)*int(unsafe.Sizeof(data[0]))))
	if h == 0 {
		_, _, _ = closeClipboard.Call()
		return err
	}
	defer func() {
		if h != 0 {
			globalFree.Call(h)
		}
	}()

	l, _, err := globalLock.Call(h)
	if l == 0 {
		_, _, _ = closeClipboard.Call()
		return err
	}

	r, _, err = lstrcpy.Call(l, uintptr(unsafe.Pointer(&data[0])))
	if r == 0 {
		_, _, _ = closeClipboard.Call()
		return err
	}

	r, _, err = globalUnlock.Call(h)
	if r == 0 {
		if err.(syscall.Errno) != 0 {
			_, _, _ = closeClipboard.Call()
			return err
		}
	}

	r, _, err = setClipboardData.Call(cfUnicodetext, h)
	if r == 0 {
		_, _, _ = closeClipboard.Call()
		return err
	}
	h = 0 // suppress deferred cleanup
	closed, _, err := closeClipboard.Call()
	if closed == 0 {
		return err
	}
	return nil
}

// waitOpenClipboard opens the clipboard, waiting for up to a second to do so.
func waitOpenClipboard() error {
	started := time.Now()
	limit := started.Add(time.Second)
	var r uintptr
	var err error
	for time.Now().Before(limit) {
		r, _, err = openClipboard.Call(0)
		if r != 0 {
			return nil
		}
		time.Sleep(time.Millisecond)
	}
	return err
}
