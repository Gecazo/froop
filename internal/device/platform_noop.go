//go:build !darwin && !linux && !windows

package device

func newPlatformAdapter(_ string) Adapter {
	return &NoopAdapter{}
}
