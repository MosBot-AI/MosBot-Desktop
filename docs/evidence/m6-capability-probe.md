# M6 · Group Chat and Voice Capability Probe

[简体中文](m6-capability-probe-zh.md)

- Card: M6 (group avatars/group chat, voice recording and transcription)
- Status: **Group chat is operational on the target deployment (hosted-room driver running, 2 rooms listed); voice wake is unavailable on this headless deployment. Implementation has not started.**
- Recorded: 2026-11-09
- Target service: `192.168.2.171:9119` (v0.22.5 / `bf0203a794`)
- Command: `MOSBOT_DASHBOARD_URL=http://192.168.2.171:9119 MOSBOT_PROBE_MODE=ws npm run test:integration`
- Data nature: real Dashboard WebSocket, read-only RPC (`groups.capabilities`, `groups.list`, `wake.status`); no state-changing calls
- Report (ignored working data): `docs/evidence/tmp/dashboard-probe-2026-11-09T16-14-52-900Z.json`

## Results

| Capability                       | Status | Detail                                                      |
| -------------------------------- | ------ | ----------------------------------------------------------- |
| Group chat `groups.capabilities` | ✅     | `driver=true` · `methods=18` · `room_link_enabled=true`     |
| Group chat `groups.list`         | ✅     | `rooms=2` (hosted rooms are readable)                       |
| Voice wake `wake.status`         | ⛔     | `available=false` · `enabled=false` · `listening=false`     |
| Existing `client.capabilities`   | ✅     | `server_requests=16` (approval/clarify contracts unchanged) |

## Conclusion

- **Group chat is operational** on the target deployment: the hosted-room driver is running, the gateway advertises 18 `groups.*`
  methods with a room link, and `groups.list` returns 2 existing rooms. M6 group-chat work can be scheduled; the recording's entry
  hierarchy still needs to be designed before implementation.
- **Voice wake is unavailable** on this headless deployment (`available=false`), so wake-word/recording acceptance cannot be proven
  here. `voice.record`/`voice.tts` were not called because they change state and need audio input; recording/transcription remains
  unverified.
- No implementation has started for M6; this probe only establishes the capability baseline.

## Next

1. Decide whether group chat is scheduled for the first release or the M6 follow-up; the plan currently keeps M6 post-release.
2. Design the group entry hierarchy from the reference recording, then implement against the 18 advertised `groups.*` methods.
3. For voice, obtain a deployment/device with audio input and wake support before claiming recording/transcription; otherwise keep it
   out of scope.
