# server/services

The only layer permitted to perform network I/O to third parties (classifier inference, LLM provider, notification delivery). Every service must have a mock/offline mode so the app can satisfy R7.
