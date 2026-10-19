// SourceFlow - Make knowledge flow
// Copyright (c) 2020-present, SourceFlow contributors
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

package model

import (
	"bytes"
	"encoding/base64"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/lonelyor/sourceflow/kernel/conf"
	"github.com/lonelyor/sourceflow/kernel/util"
	"github.com/lonelyor/sourceflow/third_party/go/dejavu/cloud"
	"github.com/lonelyor/sourceflow/third_party/go/httpclient"
	"github.com/lonelyor/sourceflow/third_party/go/logging"
	"github.com/studio-b12/gowebdav"
)

// TestSyncProviderWebDAV tests WebDAV read/write/delete access without saving
// the supplied configuration.
func TestSyncProviderWebDAV(webdav *conf.WebDAV) (err error) {
	if nil == webdav {
		return errors.New("WebDAV sync provider config is required")
	}

	if err = validateWebDAVConnectionTestConfig(webdav); nil != err {
		return
	}
	normalizeWebDAVConfig(webdav)
	if "" == webdav.Password && nil != Conf.Sync.WebDAV {
		webdav.Password = Conf.Sync.WebDAV.Password
	}

	cloudDir := "main"
	if nil != Conf && nil != Conf.Sync && "" != Conf.Sync.CloudName {
		cloudDir = Conf.Sync.CloudName
	}
	cloudConf := &cloud.Conf{
		Dir:    cloudDir,
		UserID: "0",
		WebDAV: &cloud.ConfWebDAV{
			Endpoint:       webdav.Endpoint,
			Username:       webdav.Username,
			Password:       webdav.Password,
			SkipTlsVerify:  webdav.SkipTlsVerify,
			Timeout:        webdav.Timeout,
			ConcurrentReqs: webdav.ConcurrentReqs,
		},
	}
	testCloud := newWebDAVCloud(cloudConf)
	testPath := "sourceflow-connection-test-" + util.CurrentTimeSecondsStr() + "-" + util.RandString(8)
	data := []byte("sourceflow-webdav-connection-test")
	if _, err = testCloud.UploadBytes(testPath, data, true); nil != err {
		return fmt.Errorf("upload test object failed: %s", err)
	}

	downloaded, downloadErr := testCloud.DownloadObject(testPath)
	if nil != downloadErr {
		err = fmt.Errorf("download test object failed: %s", downloadErr)
	} else if !bytes.Equal(data, downloaded) {
		err = errors.New("download test object failed: content mismatch")
	}

	if removeErr := testCloud.RemoveObject(testPath); nil != removeErr {
		logging.LogWarnf("remove WebDAV connection test object failed: %s", removeErr)
		if nil == err {
			err = fmt.Errorf("delete test object failed: %s", removeErr)
		}
	}
	return
}

func normalizeWebDAVConfig(webdav *conf.WebDAV) {
	webdav.Endpoint = util.NormalizeEndpoint(strings.TrimSpace(webdav.Endpoint))
	webdav.Username = strings.TrimSpace(webdav.Username)
	webdav.Password = strings.TrimSpace(webdav.Password)
	webdav.Timeout = util.NormalizeTimeout(webdav.Timeout)
	webdav.ConcurrentReqs = util.NormalizeConcurrentReqs(webdav.ConcurrentReqs, conf.ProviderWebDAV)
}

func validateWebDAVConnectionTestConfig(webdav *conf.WebDAV) error {
	endpoint := strings.TrimSpace(webdav.Endpoint)
	if "" == endpoint {
		return errors.New("endpoint is empty")
	}
	if strings.Contains(endpoint, "://") && !strings.HasPrefix(endpoint, "http://") && !strings.HasPrefix(endpoint, "https://") {
		return errors.New("endpoint must use HTTP or HTTPS")
	}
	return nil
}

func newWebDAVCloud(cloudConf *cloud.Conf) cloud.Cloud {
	webdavClient := gowebdav.NewClient(cloudConf.WebDAV.Endpoint, cloudConf.WebDAV.Username, cloudConf.WebDAV.Password)
	auth := base64.StdEncoding.EncodeToString([]byte(cloudConf.WebDAV.Username + ":" + cloudConf.WebDAV.Password))
	webdavClient.SetHeader("Authorization", "Basic "+auth)
	webdavClient.SetHeader("User-Agent", util.UserAgent)
	webdavClient.SetTimeout(time.Duration(cloudConf.WebDAV.Timeout) * time.Second)
	webdavClient.SetTransport(httpclient.NewTransport(cloudConf.WebDAV.SkipTlsVerify))
	return cloud.NewWebDAV(&cloud.BaseCloud{Conf: cloudConf}, webdavClient)
}
