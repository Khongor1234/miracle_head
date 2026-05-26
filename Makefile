.PHONY: start stop restart backend frontend

PIDS_DIR  := .pids
LOGS_DIR  := .logs
UV        := $(shell command -v uv 2>/dev/null || echo $(HOME)/.local/bin/uv)
PYTHON    := $(UV) run python

$(PIDS_DIR):
	mkdir -p $(PIDS_DIR)

$(LOGS_DIR):
	mkdir -p $(LOGS_DIR)

start: stop $(PIDS_DIR) $(LOGS_DIR)
	@nohup $(PYTHON) -m backend.main > $(LOGS_DIR)/backend.log 2>&1 & echo $$! > $(PIDS_DIR)/backend.pid
	@(cd frontend; nohup ./node_modules/.bin/vite > ../$(LOGS_DIR)/frontend.log 2>&1 & echo $$! > ../$(PIDS_DIR)/frontend.pid)
	@echo "Backend:  http://localhost:8001"
	@echo "Frontend: http://localhost:5173"

backend: $(PIDS_DIR) $(LOGS_DIR)
	@nohup $(PYTHON) -m backend.main > $(LOGS_DIR)/backend.log 2>&1 & echo $$! > $(PIDS_DIR)/backend.pid
	@echo "Backend:  http://localhost:8001"

frontend: $(PIDS_DIR) $(LOGS_DIR)
	@(cd frontend; nohup ./node_modules/.bin/vite > ../$(LOGS_DIR)/frontend.log 2>&1 & echo $$! > ../$(PIDS_DIR)/frontend.pid)
	@echo "Frontend: http://localhost:5173"

stop:
	@if [ -f $(PIDS_DIR)/backend.pid ]; then \
		kill -9 $$(cat $(PIDS_DIR)/backend.pid) 2>/dev/null; \
		rm -f $(PIDS_DIR)/backend.pid; \
	fi
	@if [ -f $(PIDS_DIR)/frontend.pid ]; then \
		kill -9 $$(cat $(PIDS_DIR)/frontend.pid) 2>/dev/null; \
		rm -f $(PIDS_DIR)/frontend.pid; \
	fi
	@pkill -f "backend.main" 2>/dev/null || true
	@pkill -f "node .*vite" 2>/dev/null || true

restart: stop
	@sleep 1
	@$(MAKE) start
