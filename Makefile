.PHONY: install-prehook	install install-dev lint test

install-prehook:
	cp pre-commit .git/hooks/

install: install-prehook
	npm install & gpg --import ./resources/node-logs.asc

install-dev:
	npm install --dev

lint:
	eslint .

test:
	npm test
