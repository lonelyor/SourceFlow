package epub

import (
	"bytes"
	"testing"
)

func TestReader(t *testing.T) {
	fn := "./data/test.epub"

	bk, err := Open(fn)
	if err != nil {
		t.Fatal(err)
	}

	if len(bk.Files()) != 211 {
		t.Fatal("invalid files counter")
	}

	bk.Close()

	i := 0

	Reader(fn, func(n string, data []byte) bool {
		i++
		if data == nil {
			t.Fatal("reader failed")
		}
		return true
	})

	if i != 182 {
		t.Fatal("Invalid chapter numbers")
	}

	buf := bytes.NewBuffer(nil)

	ToTxt(fn, buf)

	if buf.Len() == 0 {
		t.Fatal("ToTxt failed")
	}
}
