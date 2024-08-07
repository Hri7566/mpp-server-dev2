![MPP](https://github.com/multiplayerpiano/mpp-frontend-v1/blob/master/static/128-piano.png?raw=true)

# mpp-server-dev2

This is an MPP server currently in development for [MPP.dev](https://www.multiplayerpiano.dev). The original server is old and the site desperately needs a new one.

This server uses Bun - not just the runtime, but the libraries as well. This is because Bun provides easy access to uWebSockets.js, a speedy implementation of WebSockets that heavily outperforms the old `ws` module that is used so frequently.

I have tried to comply well with Brandon Lockaby's original MPP server so that this server stays widely accessible for any frontend implementation, including the ones used by MultiplayerPiano.net, LapisHusky's frontend, and the frontends used by nagalun's server, as well as the smnmpp and mpp.hri7566.info frontends.

Of course, most of the ones I have listed probably won't work yet because I haven't implemented a way to switch between token authentication and legacy connections yet.

Regardless, this server is meant for speed, stability, and compatability.

This server uses Prisma as an ORM for saving user data, and is currently setup to interface with SQLite. I may be switching this to PostgreSQL in the very near future, so don't get too comfortable with SQLite.

Brandon's server originally used MongoDB for storing user data, but there are too many reasons to list why it isn't fit for this project here, so I will link [this video by Theo](https://www.youtube.com/watch?v=cC6HFd1zcbo) instead.

## List of features

- Chat
    - Original chat filter by chacha and Brandon Lockaby
    - Commands for debugging or administrative purposes
- Piano Notes
    - Uses the same `NoteQuota` implementation from the client
- Usernames/colors
    - Allowing color changing can be toggled in the config, similar to MPP.com
    - Default user parameters can be set
    - Configurable ID and color generation methods
- Channels
    - Channel list
    - Channel settings
    - Options to keep channels forceloaded
        - Configurable
        - Ability to forceload at runtime
- Rate limits
    - Borrowed from Brandon's GitHub Gist account
- Brandon-style admin messages
    - Remote name changing
    - Color changing
    - User flag settings
        - Ability to change the volume of users' notes (affects note velocity)
        - Chat muting
        - Rate limit bypasses
    - Channel/User-targeted notifications
    - Server-wide/channel-specific/user-specific notifications
- New admin messages
    - Restart message
        - Triggers notification on every connected socket, then shuts down after 20 seconds
        - Server must be setup as a pm2/docker/systemd process for automatic restarting
    - Ability to change tags
        - Similar to the MPP.net server, but uses a Brandon-style admin message
    - Ability to rename channels
    - Chat clearing similar to MPP.net
    - Channel forceloading message

## TODO

- Fully implement and test tags
    - Tags are sent to clients now
    - Check if tags are sent to everyone
- Permission groups and permissions
    - Probable permission groups: owner, admin, mod, trialmod, default
    - Setup tags for each permission group
- Redo ratelimits
- Full server-wide event bus
    - Channel events
    - Socket events
    - User data events
    - Permission-related events
- Redo all of the validations with Zod
    - This probably means making Zod schemas for every single message type
    - Also user and channel data
- Test every frontend
- Test fishing bot
- Remote console
- Modify frontend to use templating

## Backlog/Notes

- Use template engine instead of raw HTML?
    - Change frontend files at runtime?
    - Split script.js into multiple files
    - Implement tags as a server option, toggles code on frontend
        - Same with color changing
- Reload config files on save
- Expose API?

## How to run

Don't expect these instructions to stay the same. They might not even be up to date already! This is due to frequent changes in this repository, as this project is still in active development.

0. Install bun

    ```
    $ curl -fsSL https://bun.sh/install | bash
    ```

1. Clone the repo and setup Git submodules

This step is subject to change, due to the necessity of testing different frontends, where the frontend may or may not be a git submodule.
This will probably be updated in the near future. Expect a step asking to download the frontend manually.
If you are forking this repository, you can just setup a new submodule for the frontend.
The frontend files go in the `public` folder.

I am also considering using handlebars or something similar for templating, where the frontend will require completely different code.
The reason behind this decision is that I would like different things to change on the frontend based on the server's config files,
such as enabling the color changing option in the userset modal menu, or sending separate code to server admins/mods/webmasters.


    ```
    $ git clone https://git.hri7566.info/Hri7566/mpp-server-dev2
    $ cd mpp-server-dev2
    $ git submodule update --init --recursive
    ```

2. Configure

    - Copy environment variables

    ```
    $ cp .env.template .env
    ```

    Edit `.env` to your needs. Some variables are required for certain features to work.

    - Edit the files in the `config` folder to match your needs

    For token auth, there are a few options to consider. In `config/users.yml`, you can set `tokenAuth` to a few different values:

    - `jwt`: Use JWT token authentication
    - `uuid`: Use UUID token authentication
    - `none`: Disable token authentication

    If you are using UUID token authentication, the server will generate a UUID token for each user when they first connect.

    If you are using JWT token authentication, you will need to generate a key for the server to use.
    This can be done by running the following command:

    ```
    $ openssl genrsa -out mppkey 2048
    ```

    For antibot/browser detection there are also a few options to consider. In `config/users.yml`, you can set `browserChallenge` to a few different values:

    - `none`: Disable browser challenge
    - `basic`: Use a simple function to detect browsers
    - `obf`: Use an obfuscated function to detect browsers - TODO: implement this

    The `basic` option only sends a simple function to the client, and the `obf` option sends an obfuscated mess to the client.

    This option requires the newer-style (MPP.net) frontend to be used.

3. Install packages

    ```
    $ bun i
    ```

4. Setup database

    ```
    $ bunx prisma generate
    $ bunx prisma db push
    ```

5. Run

    ```
    $ bun .
    ```
