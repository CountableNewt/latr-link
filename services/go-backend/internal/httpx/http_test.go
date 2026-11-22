package httpx

import (
	"io"
	"net"
	"net/http"
	"net/url"
	"strings"
	"testing"
	"time"
)

func TestPublicIPRejectsPrivateAndSpecialAddresses(t *testing.T) {
	for _, s := range []string{"127.0.0.1", "10.0.0.1", "192.168.0.1", "169.254.169.254", "::1", "fc00::1", "fe80::1", "100.64.0.1", "198.18.0.1", "192.0.2.1"} {
		if PublicIP(net.ParseIP(s)) {
			t.Errorf("accepted %s", s)
		}
	}
	if !PublicIP(net.ParseIP("1.1.1.1")) {
		t.Fatal("rejected public IP")
	}
}
func TestReadJSONEnforcesBodyLimit(t *testing.T) {
	r := &http.Response{Body: io.NopCloser(strings.NewReader(`{"long":"payload"}`))}
	var got map[string]string
	if e := ReadJSON(r, 5, &got); e == nil {
		t.Fatal("oversized response accepted")
	}
}

func TestPublicClientRejectsHTTPSDowngrade(t *testing.T) {
	c := PublicClient(time.Second)
	from, _ := url.Parse("https://example.com/x")
	to, _ := url.Parse("http://example.com/x")
	if e := c.CheckRedirect(&http.Request{URL: to}, []*http.Request{{URL: from}}); e == nil {
		t.Fatal("HTTPS downgrade allowed")
	}
}
