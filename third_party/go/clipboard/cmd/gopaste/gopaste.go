package main

import (
	"fmt"

	"github.com/lonelyor/sourceflow/third_party/go/clipboard"
)

func main() {
	text, err := clipboard.ReadAll()
	if err != nil {
		panic(err)
	}

	fmt.Print(text)
}
