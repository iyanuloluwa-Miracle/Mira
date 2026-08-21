# server/api

HTTP route handlers, one subfolder per feature area. Routes validate input with zod (R8) and call server/domain/ or server/services/ — they never contain business logic themselves.
