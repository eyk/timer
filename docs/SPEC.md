# [Home](../README.md) › Specification

Eyk / Timer is an offline countdown tool. Its core interaction is to open the timer, enter minutes, start the countdown and acknowledge the alarm. Maintenance protects this flow through fixes, security updates and platform compatibility work.

| Requirement | Acceptance criterion |
| --- | --- |
| Start quickly | Opening the timer prepares an empty input for immediate entry. Enter one to three digits, from 1 to 999 minutes, and confirm with a single action. Invalid input starts no timer. |
| Keep out of the way | Once started, the entry view yields focus or closes where the platform supports it. Reopening shows the active timers and an empty entry field. |
| Run independent timers | Up to ten timers can run together. Show the remaining time in minutes and seconds. Starting or cancelling one timer leaves the others running. |
| Count elapsed time | A timer continues while the entry view is out of sight. Changing the calendar clock does not change its duration. If the device cannot alert during sleep, deliver the overdue alarm when it can. |
| Signal expiry | Use an audible and visible alert where the system permits it. An explicit acknowledgement clears expired timers and leaves running timers intact. Input already in flight when the alarm appears must not dismiss it accidentally. |
| Keep the interface small | The current countdowns and the next entry are easy to distinguish. Follow the system appearance and language preferences. Keep controls limited to the timer workflow. |
| Operate locally | Creating, running and acknowledging timers requires no network or account. Timer state stays on the device. |

Keyboard, touch, background scheduling and alert delivery use the available system controls. See [Architecture](ARCHITECTURE.md) for implementation and platform status.
