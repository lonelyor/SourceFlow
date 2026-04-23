package model

import "errors"

func CloudChatGPT(msg string, contextMsgs []string) (ret string, stop bool, err error) {
	return "", false, errors.New("the official cloud AI service has been removed")
}

func SetCloudBlockReminder(id, data string, timed int64) (err error) {
	return errors.New("the official cloud reminder service has been removed")
}
