# server/services/classifier

Adapter to the NLP classifier service (component 3). Wraps HTTP calls to services/classifier/, times out fast, and fails closed into an 'unavailable' state consumed by triage.
