package util

import "strings"

const BlockProtocol = "sf://blocks/"

func IsBlockProtocolLink(href string) bool {
	return strings.HasPrefix(href, BlockProtocol)
}

func TrimBlockProtocol(href string) string {
	if strings.HasPrefix(href, BlockProtocol) {
		return strings.TrimPrefix(href, BlockProtocol)
	}
	return href
}

func BuildBlockProtocol(id string) string {
	return BlockProtocol + id
}
