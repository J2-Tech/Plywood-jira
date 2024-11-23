# Privacy notice

This application does not store any data, or generate any logs locally. 
Any data retrieved from Atlassian's APIs is immediately processed and returned to the user.
The only exception is the OAuth 2.0 tokens and refresh tokens, which are stored in the user's session on the server, then deleted when it expires. As of now, those sessions are only stored in RAM.
The session cookie is stored and managed by the user's browser, so it is their responsability to ensure their browser is secure.

The program uses HTTPS requests between itself and Atlassian's APIs, unless disabled by the user, and uses HTTP by default between the user and itself.
It is *not* intended to be exposed publicly, but rather installed in a secure environment and accessed locally. (For example, on a secure server, on a secure network, accessed locally by secure clients.). HTTPS Support is provided, but it is solely the responasbility of the user to set it up properly, test it, and ensure it is working adequately for their needs.


This program is not designed to collect any data, and will never be.
