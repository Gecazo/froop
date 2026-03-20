package app

import (
	"archive/zip"
	"bytes"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
)

const apiBase = "https://api.prod.whoop.com"

type whoopAPIClient struct {
	httpClient *http.Client
	token      string
}

type signInRequest struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

type signInResponse struct {
	AccessToken string `json:"access_token"`
}

type chipFirmware struct {
	ChipName string `json:"chip_name"`
	Version  string `json:"version"`
}

type firmwareRequest struct {
	CurrentChipFirmwares   []chipFirmware `json:"current_chip_firmwares"`
	ChipFirmwaresOfUpgrade []chipFirmware `json:"chip_firmwares_of_upgrade"`
}

type firmwareResponse struct {
	FirmwareZipFile *string `json:"firmware_zip_file"`
	FirmwareFile    *string `json:"firmware_file"`
}

func signInWhoop(email, password string) (*whoopAPIClient, error) {
	body, _ := json.Marshal(signInRequest{Username: email, Password: password})
	req, err := http.NewRequest(http.MethodPost, apiBase+"/auth-service/v2/whoop/sign-in", bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to reach WHOOP auth endpoint: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode > 299 {
		b, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("authentication failed (%s): %s", resp.Status, string(b))
	}
	var auth signInResponse
	if err := json.NewDecoder(resp.Body).Decode(&auth); err != nil {
		return nil, fmt.Errorf("invalid auth response: %w", err)
	}
	return &whoopAPIClient{httpClient: client, token: auth.AccessToken}, nil
}

func (c *whoopAPIClient) downloadFirmware(deviceName string, currentVersions []chipFirmware, upgradeVersions []chipFirmware) (string, error) {
	body, _ := json.Marshal(firmwareRequest{CurrentChipFirmwares: currentVersions, ChipFirmwaresOfUpgrade: upgradeVersions})
	u, err := url.Parse(apiBase + "/firmware-service/v4/firmware/version")
	if err != nil {
		return "", err
	}
	q := u.Query()
	q.Set("deviceName", deviceName)
	u.RawQuery = q.Encode()

	req, err := http.NewRequest(http.MethodPost, u.String(), bytes.NewReader(body))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+c.token)
	req.Header.Set("X-WHOOP-Device-Platform", "ANDROID")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("failed to reach firmware endpoint: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode > 299 {
		b, _ := io.ReadAll(resp.Body)
		return "", fmt.Errorf("firmware download failed (%s): %s", resp.Status, string(b))
	}
	var fw firmwareResponse
	if err := json.NewDecoder(resp.Body).Decode(&fw); err != nil {
		return "", fmt.Errorf("invalid firmware response: %w", err)
	}
	if fw.FirmwareZipFile != nil {
		return *fw.FirmwareZipFile, nil
	}
	if fw.FirmwareFile != nil {
		return *fw.FirmwareFile, nil
	}
	return "", fmt.Errorf("no firmware file found in response")
}

func decodeAndExtractFirmware(firmwareB64 string, outputDir string) error {
	if err := os.MkdirAll(outputDir, 0o755); err != nil {
		return err
	}
	zipBytes, err := base64.StdEncoding.DecodeString(firmwareB64)
	if err != nil {
		return fmt.Errorf("failed to base64-decode firmware: %w", err)
	}
	zipPath := filepath.Join(outputDir, "firmware.zip")
	if err := os.WriteFile(zipPath, zipBytes, 0o644); err != nil {
		return err
	}

	zr, err := zip.NewReader(bytes.NewReader(zipBytes), int64(len(zipBytes)))
	if err != nil {
		return fmt.Errorf("invalid zip archive: %w", err)
	}
	for _, f := range zr.File {
		outPath := filepath.Join(outputDir, f.Name)
		if f.FileInfo().IsDir() {
			if err := os.MkdirAll(outPath, 0o755); err != nil {
				return err
			}
			continue
		}
		if err := os.MkdirAll(filepath.Dir(outPath), 0o755); err != nil {
			return err
		}
		rc, err := f.Open()
		if err != nil {
			return err
		}
		b, err := io.ReadAll(rc)
		rc.Close()
		if err != nil {
			return err
		}
		if err := os.WriteFile(outPath, b, 0o644); err != nil {
			return err
		}
	}
	return nil
}
