// SourceFlow - Make knowledge flow
// Copyright (c) 2020-present, SourceFlow contributors
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

package conf

import (
	"strings"

	"golang.org/x/crypto/bcrypt"
)

type Publish struct {
	Enable bool       `json:"enable"`
	Port   uint16     `json:"port"`
	Auth   *BasicAuth `json:"auth"`
}

type BasicAuth struct {
	Enable   bool                `json:"enable"`
	Accounts []*BasicAuthAccount `json:"accounts"`
}

type BasicAuthAccount struct {
	Username string `json:"username"`
	Password string `json:"password"`
	Memo     string `json:"memo"`
}

func (a *BasicAuthAccount) HashPasswordIfPlain() {
	if a.Password != "" && !strings.HasPrefix(a.Password, "$2a$") && !strings.HasPrefix(a.Password, "$2b$") {
		hash, err := bcrypt.GenerateFromPassword([]byte(a.Password), bcrypt.DefaultCost)
		if err == nil {
			a.Password = string(hash)
		}
	}
}

func (a *BasicAuthAccount) CheckPassword(plain string) bool {
	if strings.HasPrefix(a.Password, "$2a$") || strings.HasPrefix(a.Password, "$2b$") {
		return bcrypt.CompareHashAndPassword([]byte(a.Password), []byte(plain)) == nil
	}
	return a.Password == plain
}

func NewPublish() *Publish {
	return &Publish{
		Enable: false,
		Port:   6808,
		Auth: &BasicAuth{
			Enable:   true,
			Accounts: []*BasicAuthAccount{},
		},
	}
}
