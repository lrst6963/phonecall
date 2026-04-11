.PHONY: build clean web

APP_NAME = phonecall

all: build

web:
	@echo "Building Web Frontend..."
	cd web && npm install && npm run build
	@echo "Web Frontend build complete."

build: web
	@echo "Building $(APP_NAME)..."
	CGO_ENABLED=0 go build -ldflags "-w -s" -o $(APP_NAME) .
	@echo "Build complete. You can run ./$(APP_NAME) now."

clean:
	@echo "Cleaning up..."
	rm -f $(APP_NAME)
	# rm -f cert.pem key.pem
	@echo "Clean complete."
