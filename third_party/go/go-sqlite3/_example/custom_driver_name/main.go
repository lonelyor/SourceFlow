package main

import (
	"database/sql"

	_ "github.com/lonelyor/sourceflow/third_party/go/go-sqlite3"
)

func main() {
	for _, driver := range sql.Drivers() {
		println(driver)
	}
}
