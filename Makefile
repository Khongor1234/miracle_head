.PHONY: start stop restart backend frontend

PIDS_DIR := .pids

$(PIDS_DIR):
	mkdir -p $(PIDS_DIR)

start: backend frontend

backend: $(PIDS_DIR)
	python -m backend.main & echo $$! > $(PIDS_DIR)/backend.pid

frontend: $(PIDS_DIR)
	cd frontend && npm run dev & echo $$! > $(PIDS_DIR)/frontend.pid

stop:
	@if [ -f $(PIDS_DIR)/backend.pid ]; then \
		kill $$(cat $(PIDS_DIR)/backend.pid) 2>/dev/null; \
		rm $(PIDS_DIR)/backend.pid; \
	fi
	@if [ -f $(PIDS_DIR)/frontend.pid ]; then \
		kill $$(cat $(PIDS_DIR)/frontend.pid) 2>/dev/null; \
		rm $(PIDS_DIR)/frontend.pid; \
	fi

restart: stop
	sleep 1
	$(MAKE) start
