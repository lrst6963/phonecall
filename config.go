package main

import (
	"flag"
	"os"
	"strconv"
)

// Config 存储应用配置
type Config struct {
	HTTPSPort  string
	CertFile   string
	KeyFile    string
	Mode       string // 模式预设：normal, walkie-talkie
	Protocol   string // 协议预设：ws, webrtc
	Quality    string // 音质预设：lossless, high, medium, low
	SampleRate int
	BufferSize int
}

// LoadConfig 解析命令行参数和环境变量并返回 Config
func LoadConfig() *Config {
	cfg := &Config{}

	// 使用命令行参数设置默认值
	flag.StringVar(&cfg.HTTPSPort, "https-port", getEnv("HTTPS_PORT", ":8443"), "HTTPS server port (e.g. :8443)")
	flag.StringVar(&cfg.CertFile, "cert-file", getEnv("CERT_FILE", "cert.pem"), "TLS certificate file path")
	flag.StringVar(&cfg.KeyFile, "key-file", getEnv("KEY_FILE", "key.pem"), "TLS key file path")
	flag.StringVar(&cfg.Mode, "mode", getEnv("MODE", "normal"), "Operation mode (normal, walkie-talkie). 'walkie-talkie' enforces strict one-way communication and max 2 users.")
	flag.StringVar(&cfg.Protocol, "protocol", getEnv("PROTOCOL", "webrtc"), "Media transport protocol (ws, webrtc). 'ws' uses WebSocket, 'webrtc' uses WebRTC data channels or audio streams.")
	flag.StringVar(&cfg.Quality, "quality", getEnv("QUALITY", "lossless"), "Audio quality preset (lossless, high, medium, low). Overrides sample-rate and buffer-size.")
	flag.IntVar(&cfg.SampleRate, "sample-rate", getEnvAsInt("SAMPLE_RATE", 48000), "Audio sample rate in Hz")
	flag.IntVar(&cfg.BufferSize, "buffer-size", getEnvAsInt("BUFFER_SIZE", 4096), "Audio buffer size")
	
	flag.Parse()

	// walkie-talkie 模式下强制为无损音质
	if cfg.Mode == "walkie-talkie" {
		cfg.Quality = "lossless"
	}

	// 如果设置了预设配置，则预设优先级高于自定义参数
	switch cfg.Quality {
	case "lossless":
		// 无损模式：将 SampleRate 和 BufferSize 设置为 0，表示由前端浏览器自动决定最佳参数（硬件默认）
		cfg.SampleRate = 0
		cfg.BufferSize = 0
	case "high":
		cfg.SampleRate = 48000
		cfg.BufferSize = 2048
	case "medium":
		cfg.SampleRate = 44100
		cfg.BufferSize = 4096
	case "low":
		cfg.SampleRate = 16000
		cfg.BufferSize = 8192
	}

	return cfg
}

// getEnv 获取环境变量，如果不存在则返回默认值
func getEnv(key, fallback string) string {
	if value, exists := os.LookupEnv(key); exists {
		return value
	}
	return fallback
}

// getEnvAsInt 获取整数类型的环境变量
func getEnvAsInt(key string, fallback int) int {
	if valueStr, exists := os.LookupEnv(key); exists {
		if value, err := strconv.Atoi(valueStr); err == nil {
			return value
		}
	}
	return fallback
}
