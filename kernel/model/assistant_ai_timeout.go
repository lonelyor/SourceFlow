package model

import (
	"context"
	"fmt"
	"net"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"github.com/sashabaranov/go-openai"
)

func assistantAIRequestTimeout(profile *AssistantAIProfile) time.Duration {
	timeout := getAssistantAIIntSetting(profile.Settings, "timeout", assistantAIDefaultTimeout)
	if timeout < 1 {
		timeout = assistantAIDefaultTimeout
	}
	return time.Duration(timeout) * time.Second
}

func assistantAIBaseContext(opts *assistantAIChatOptions) context.Context {
	if nil != opts && nil != opts.RequestContext {
		return opts.RequestContext
	}
	return context.Background()
}

func assistantAIRequestContext(profile *AssistantAIProfile, opts *assistantAIChatOptions) (context.Context, context.CancelFunc) {
	return context.WithTimeout(assistantAIBaseContext(opts), assistantAIRequestTimeout(profile))
}

type assistantAIStreamIdleGuard struct {
	cancel       context.CancelFunc
	timeout      time.Duration
	timer        *time.Timer
	mu           sync.Mutex
	lastActivity time.Time
	stopped      bool
	timedOut     bool
}

func assistantAIStreamContext(profile *AssistantAIProfile, opts *assistantAIChatOptions) (context.Context, *assistantAIStreamIdleGuard) {
	ctx, cancel := context.WithCancel(assistantAIBaseContext(opts))
	timeout := assistantAIRequestTimeout(profile)
	guard := &assistantAIStreamIdleGuard{cancel: cancel, timeout: timeout, lastActivity: time.Now()}
	guard.timer = time.AfterFunc(timeout, guard.fire)
	return ctx, guard
}

func (guard *assistantAIStreamIdleGuard) fire() {
	guard.mu.Lock()
	defer guard.mu.Unlock()
	if guard.stopped || guard.timedOut {
		return
	}
	remaining := guard.timeout - time.Since(guard.lastActivity)
	if 0 < remaining {
		guard.timer.Reset(remaining)
		return
	}
	guard.timedOut = true
	guard.cancel()
}

func (guard *assistantAIStreamIdleGuard) Reset() {
	if nil == guard || nil == guard.timer {
		return
	}
	guard.mu.Lock()
	defer guard.mu.Unlock()
	if guard.stopped || guard.timedOut {
		return
	}
	guard.lastActivity = time.Now()
	guard.timer.Reset(guard.timeout)
}

func (guard *assistantAIStreamIdleGuard) Stop() {
	if nil == guard {
		return
	}
	guard.mu.Lock()
	if !guard.stopped {
		guard.stopped = true
		if nil != guard.timer {
			guard.timer.Stop()
		}
		guard.cancel()
	}
	guard.mu.Unlock()
}

func (guard *assistantAIStreamIdleGuard) TimedOut() bool {
	if nil == guard {
		return false
	}
	guard.mu.Lock()
	defer guard.mu.Unlock()
	return guard.timedOut
}

func (guard *assistantAIStreamIdleGuard) TimeoutError() error {
	if nil == guard {
		return fmt.Errorf("assistant AI stream timed out without provider data")
	}
	return fmt.Errorf("assistant AI stream timed out after %d seconds without provider data", int(guard.timeout.Seconds()))
}

func assistantAIHTTPTransport(profile *AssistantAIProfile, streaming bool) (*http.Transport, error) {
	timeout := assistantAIRequestTimeout(profile)
	transport := &http.Transport{
		DialContext: (&net.Dialer{
			Timeout:   minAssistantAIDuration(timeout, 30*time.Second),
			KeepAlive: 30 * time.Second,
		}).DialContext,
		MaxIdleConns:          10,
		MaxIdleConnsPerHost:   5,
		IdleConnTimeout:       90 * time.Second,
		TLSHandshakeTimeout:   minAssistantAIDuration(timeout, 10*time.Second),
		ExpectContinueTimeout: 1 * time.Second,
	}
	if streaming {
		transport.ResponseHeaderTimeout = timeout
	}
	if proxyURL := strings.TrimSpace(profile.Proxy); "" != proxyURL {
		parsed, parseErr := url.Parse(proxyURL)
		if parseErr != nil {
			return nil, parseErr
		}
		transport.Proxy = http.ProxyURL(parsed)
	}
	return transport, nil
}

func minAssistantAIDuration(a, b time.Duration) time.Duration {
	if a < b {
		return a
	}
	return b
}

type assistantAIHeaderTransport struct {
	roundTripper http.RoundTripper
	userAgent    string
}

func (transport *assistantAIHeaderTransport) RoundTrip(req *http.Request) (*http.Response, error) {
	if "" != strings.TrimSpace(transport.userAgent) {
		req.Header.Set("User-Agent", transport.userAgent)
	}
	return transport.roundTripper.RoundTrip(req)
}

func newAssistantAIOpenAICompatibleClient(profile *AssistantAIProfile, streaming bool) (*openai.Client, error) {
	transport, err := assistantAIHTTPTransport(profile, streaming)
	if err != nil {
		return nil, err
	}
	var roundTripper http.RoundTripper = transport
	if userAgent := resolveAssistantAIUserAgent(profile.UserAgent); "" != userAgent {
		roundTripper = &assistantAIHeaderTransport{
			roundTripper: transport,
			userAgent:    userAgent,
		}
	}
	httpClient := &http.Client{Transport: roundTripper}
	if !streaming {
		httpClient.Timeout = assistantAIRequestTimeout(profile)
	}

	config := openai.DefaultConfig(resolveAssistantAIOpenAICompatibleAPIKey(profile))
	config.BaseURL = profile.BaseURL
	config.HTTPClient = httpClient
	return openai.NewClientWithConfig(config), nil
}
