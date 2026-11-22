// Package metadata resolves public web and AT Protocol previews without forwarding viewer credentials.
package metadata

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/netip"
	"net/url"
	"strings"
	"time"
)

const maxHTMLBytes = 512 * 1024
const userAgent = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"

// ValidateURL rejects non-HTTP schemes, credentials, and literal local/private destinations.
// DNS answers are checked and pinned separately by the production transport on every connection.
func ValidateURL(raw string) error {
	u, err := url.Parse(strings.TrimSpace(raw))
	if err != nil || u.Hostname() == "" {
		return errors.New("invalid_url")
	}
	if u.Scheme != "https" && u.Scheme != "http" {
		return errors.New("unsupported_scheme")
	}
	if u.User != nil {
		return errors.New("blocked_credentials")
	}
	return validateHost(u.Hostname())
}
func validateHost(host string) error {
	host = strings.TrimSuffix(strings.ToLower(host), ".")
	if host == "" || host == "localhost" || host == "broadcasthost" || host == "0" || strings.HasSuffix(host, ".local") || strings.HasSuffix(host, ".localhost") || strings.Contains(host, "%") {
		return errors.New("blocked_host")
	}
	if ip, err := netip.ParseAddr(host); err == nil {
		if !publicIP(ip) {
			return errors.New("blocked_ip")
		}
		return nil
	}
	// Reject alternative numeric IPv4 spellings rather than relying on platform interpretation.
	numeric := true
	for _, c := range host {
		if c != '.' && (c < '0' || c > '9') {
			numeric = false
			break
		}
	}
	if numeric {
		return errors.New("invalid_host")
	}
	return nil
}
func publicIP(ip netip.Addr) bool {
	ip = ip.Unmap()
	if !ip.IsGlobalUnicast() || ip.IsPrivate() || ip.IsLoopback() || ip.IsLinkLocalUnicast() || ip.IsUnspecified() {
		return false
	}
	for _, raw := range []string{"100.64.0.0/10", "192.0.0.0/24", "192.0.2.0/24", "198.18.0.0/15", "198.51.100.0/24", "203.0.113.0/24", "240.0.0.0/4", "2001:db8::/32"} {
		if netip.MustParsePrefix(raw).Contains(ip) {
			return false
		}
	}
	return true
}
func safeTransport() *http.Transport {
	tr := http.DefaultTransport.(*http.Transport).Clone()
	tr.Proxy = nil
	tr.DialContext = func(ctx context.Context, network, address string) (net.Conn, error) {
		host, port, err := net.SplitHostPort(address)
		if err != nil {
			return nil, err
		}
		if err = validateHost(host); err != nil {
			return nil, err
		}
		ips, err := net.DefaultResolver.LookupNetIP(ctx, "ip", host)
		if err != nil {
			return nil, err
		}
		if len(ips) == 0 {
			return nil, errors.New("invalid_host")
		}
		for _, ip := range ips {
			if !publicIP(ip) {
				return nil, errors.New("blocked_ip")
			}
		}
		var last error
		d := net.Dialer{Timeout: 10 * time.Second}
		for _, ip := range ips {
			conn, e := d.DialContext(ctx, network, net.JoinHostPort(ip.String(), port))
			if e == nil {
				return conn, nil
			}
			last = e
		}
		return nil, last
	}
	return tr
}
func newClient(client *http.Client) *http.Client {
	var c http.Client
	if client != nil {
		c = *client
	}
	if c.Transport == nil || c.Transport == http.DefaultTransport {
		c.Transport = safeTransport()
	}
	c.CheckRedirect = func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }
	if c.Timeout == 0 || c.Timeout > 15*time.Second {
		c.Timeout = 15 * time.Second
	}
	c.Jar = nil
	return &c
}
func (r *Resolver) fetch(ctx context.Context, raw, accept string, limit int64) ([]byte, string, error) {
	ctx, cancel := context.WithTimeout(ctx, 15*time.Second)
	defer cancel()
	current := strings.TrimSpace(raw)
	for redirects := 0; redirects <= 8; redirects++ {
		if err := ValidateURL(current); err != nil {
			return nil, current, err
		}
		req, err := http.NewRequestWithContext(ctx, http.MethodGet, current, nil)
		if err != nil {
			return nil, current, errors.New("invalid_url")
		}
		req.Header.Set("Accept", accept)
		req.Header.Set("Accept-Language", "en-US,en;q=0.9")
		req.Header.Set("User-Agent", userAgent)
		req.Header.Set("Cache-Control", "no-cache")
		req.Header.Set("Referer", req.URL.Scheme+"://"+req.URL.Host+"/")
		resp, err := r.client.Do(req)
		if err != nil {
			if errors.Is(err, context.DeadlineExceeded) {
				return nil, current, errors.New("timeout")
			}
			return nil, current, errors.New("fetch_error")
		}
		if resp.StatusCode == 301 || resp.StatusCode == 302 || resp.StatusCode == 303 || resp.StatusCode == 307 || resp.StatusCode == 308 {
			loc, err := resp.Location()
			resp.Body.Close()
			if err != nil {
				return nil, current, errors.New("invalid_redirect")
			}
			current = loc.String()
			if err := ValidateURL(current); err != nil {
				return nil, current, errors.New("blocked_redirect")
			}
			continue
		}
		if resp.StatusCode < 200 || resp.StatusCode > 299 {
			resp.Body.Close()
			return nil, current, fmt.Errorf("http_%d", resp.StatusCode)
		}
		body, err := io.ReadAll(io.LimitReader(resp.Body, limit+1))
		resp.Body.Close()
		if err != nil {
			return nil, current, errors.New("fetch_error")
		}
		if int64(len(body)) > limit {
			body = body[:limit]
		}
		return body, current, nil
	}
	return nil, current, errors.New("too_many_redirects")
}
