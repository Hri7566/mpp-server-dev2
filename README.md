![MPP](https://github.com/multiplayerpiano/mpp-frontend-v1/blob/master/static/128-piano.png?raw=true)

# mpp-server-dev2

This is an MPP server currently in development for [MPP.dev](https://www.multiplayerpiano.dev). The original server is old and the site desperately needs a new one.

This server uses Bun - not just the runtime, but the libraries as well. This is because Bun provides easy access to uWebSockets.js, a speedy implementation of WebSockets that heavily outperforms the old `ws` module that is used so frequently.

I have tried to comply well with Brandon Lockaby's original MPP server so that this server stays widely accessible for any frontend implementation, including the ones used by MultiplayerPiano.net, LapisHusky's frontend, and the frontends used by nagalun's server, as well as the smnmpp and mpp.hri7566.info frontends.

Of course, most of the ones I have listed probably won't work yet because I haven't implemented a way to switch between token authentication and legacy connections yet.

Regardless, this server is meant for speed, stability, and compatability.

This server uses Prisma as an ORM for saving user data, and is currently setup to interface with SQLite. I may be switching this to PostgreSQL in the very near future, so don't get too comfortable with SQLite.

Brandon's server originally used MongoDB for storing user data, but there are too many reasons to list why it isn't fit for this project here, so I will link [this video by Theo](https://www.youtube.com/watch?v=cC6HFd1zcbo) instead.

## Naming

This server is a rewrite/reimplementation of the MPP.dev server specifically, which was called `mpp-server-dev` in its final stage of development.

The `dev` in the name is only referring to the name of the website itself, not to the fact this server is still in development.

In the future, this might just be renamed to `mpp-server` or `mpp-server-dev` again with the version `v2.0.0`, given that the original server is no longer in development.

This has always been the future intention of this project.

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

- Change `socketsBySocketID` to `socketsByUUID`
- Channel data saving
- Permission groups and permissions
    - Probable permission groups: owner, admin, mod, trialmod, default
    - Setup tags for each permission group
- MPP.com data message
    - Implement based on `spooky.js` given there is no official documentation
- No cussing setting
- Full server-wide event bus
    - Channel events
    - Socket events
    - User data events
    - Permission-related events
- Redo ratelimits
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
- Client type identification?
    - Check for certain css?
    - Check for different messages?
    - Check for URL?
    - Notifications for server-generated XSS?
- Migrate to PostgreSQL instead of SQLite
     - Likely a low priority, we use prisma anyway, but it would be nice to have a server
- Implement user caching
    - Skip redis due to the infamous licensing issues
    - Probably use a simple in-memory cache
    - Likely store with leveldb or JSON

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

## Background Info on Feature Implementation Decisions

To avoid various controversies or confusion, I will attempt to explain why certain features were implemented in this section.

### General Explanation

Multiplayer Piano was originally developed by Brandon Lockaby from 2012-2020, and this server was the original MPP server and was written in JavaScript for Node.js.
It had many unknown features and basically has no documentation, so most of the admin features based on this server are guesswork or based on tiny snippets of code acquired from various sources.
This server was hosted on `www.multiplayerpiano.com:80` until some time in 2019-2020, when it was upgraded to https and moved to `www.multiplayerpiano.dev:443`.

After that point, in late 2020, the rights to the site were sold to some user who later revealed themselves as "jacored", but they have been unhelpful in all regards.
As much as I would like to make peace with them, I have decided they are simply not worth it due to neglecting my help in the past, and threatening to sue me for alleged DDOSing or copyright infringement,
call the police, and even get some of my good friends arrested. So... past 2020, we don't have much information about the server's changes.

Due to those reasons, I have decided to deem the original server 2021-onwards as "jacored's server" or similar.
This is because it is a lot less stable and less like Brandon's original efforts to keep things running smoothly.

Somewhere around 2015-2017, there was another server developed by nagalun (aka Ming) called `multiplayerpian-server` on GitHub.
This server was written in C++ and was largely based on Brandon's server.
It was used for `piano.ourworldofpixels.com` and was forked for various other clone sites, including `mpp.terrium.net`.
This server had various admin features of its own, but due to its lack of popularity as well as documentation, it isn't very useful for this project, so not many things have been implemented from it.

In the same time frame, there was also another server developed by BopItFreak called `mpp-server` on GitHub.
This server was written in JavaScript and resembled Brandon's server in more ways.
It included some of the same admin features using the same protocol, but it was not very stable and had many bugs pertaining to untested code.
**This server was used as the basis for this repository.**
Due to this, BopItFreak's work is also credited, whether it be required or not, as his work had a lot of technical influence on this project.
BopItFreak's personal server was hosted at `augustberchelmann.com/piano/`.

In 2019, I (Hri7566) forked BopItFreak's server and fixed a lot of the issues with it, and maintained it for a few years, but given it didn't grow much, it was eventually slightly abandoned.
My fork was hosted at `mpp.hri7566.info`.

Also around 2019-2020, I helped Foonix create a server known then as multiplayerpiano.net, hosted at `multiplayerpiano.net`.
This server was heavily based on my fork of BopItFreak's server, but it slightly diverged when I added features to each site.
The site was renamed to `multiplayerpiano.dev` due to lack of care for domain maintenance on Foonix's part.
**This is where the `dev` in the name of this project comes from.**

In August 2020, a server was developed by a user named aeiou (now known as LapisHusky) called MPPClone, hosted at `mppclone.com`.
This server was eventually handed off to multiple other users, and is still up and running to this day at `multiplayerpiano.net`.
This server is likely what people call the "genuine" server now, since it is community-driven, the frontend has been maintained a lot more than the original server's, and many features were added to both the
server and the frontend to keep moderation and user experience in check.
**This server is now the most popular to clone.**
Due to this, I have decided to implement most features from the MPP.net server here.
**None of the source code from MPP.net is used in this repository.**

Around 2021-2024, multiple servers were developed by Someone8448 called `smnmpp` or similar.
These servers were closed source and roughly based on MPP.net.

Other servers were developed and forked by other users, but none of them are necessarily popular enough to be used as a reference.
This is not to say they are bad, but the fact they don't implement features in different ways makes them roughly equivalent to MPP.net/MPP.com.

### Brandon-style admin messages

MPP.com used an admin message system that could be considered fairly outdated by today's standards.
This server aims to implement all of the known features of this system.

Based on info from other users, these admin messages required a single password to be sent to the server with an admin message.
This is insecure for a number of reasons, but is implemented for the sake of compatability with older scripts.

Note that not many of these scripts exist publicly, and all of the known admin messages are from those scripts.

This likely causes these messages to be inaccurate to the original MPP.com admin messages.

Also note that this currently isn't able to be used on MPP.com because either very few people know the new password, the system doesn't work the way it is currently implemented here, or it was removed from
MPP.com's server code.

These admin messages included the following:
- "name"
- "color"
- "user_flag"
- "notification"

From the aforementioned scripts, user flags were also found and implemented in this server.

### Token authentication

MPP.net used two different token authentication systems in the past.

The first system was a UUID token system that would generate tokens with random UUIDs.
This was used for a few years until it might've been deemed insecure and was replaced with JWT tokens.

The second system is a JWT token system that is used to this day.
This system is a bit more complicated, but the tokens contain more information than the UUID system.

Both systems are used to authenticate users, but the JWT system is likely slightly more secure.

Due to this, both systems have been implemented, and, when either system is enabled, tokens from any other system are allowed to be used, mimicking MPP.net's behavior.

### Browser challenge (Proof of Work/Bot detection)

MPP.com did not check for bots very well.
Brandon implemented various methods to detect proxies and VPNs, but it wasn't very effective.
These methods included checking lists from `ip2proxy` and even portscanning users sometimes, but it wasn't very reliable and portscanning isn't really a justifiable action.

MPP.net checks for bots using an obfuscated function that is sent to the client.
This obfuscated code that checks various things in the browser to determine if it is running in a browser or another runtime, such as Node.js, Bun, or raw V8.

There was another method previously used by MPP.net for proof of work, but it was far too unreliable and caused issues relating to CPU usage on the client.
This caused the developers to switch to the generic obfuscated function method used nowadays.

Someone8448 also implemented their own antibot system, but there are no plans to implement it in this server.

### Color changing

Although this feature is likely self-explanatory, it is worth mentioning due to the fact it isn't enabled on MPP.com.
Most other servers including MPP.net allow color changing.

Color changing is simply whether clients have the ability to change their color in the `userset` message.

### Chat filtering

MPP.com and MPP.net use separate chat filters.

MPP.com's chat filter was very basic. It only blocked the terms "AMIGHTYWIND" and "CHECKLYHQ" from chat.
It also had an unused channel setting called "no cussing" that would have been used to block chat from certain channels, but it was never implemented server-side.

MPP.net's chat filter is more advanced.
It blocks many terms that may be considered offensive.
This chat filter isn't planned to be implemented on this server, but it may be implemented in the future if there is enough interest.
This server also has the aforementioned "no cussing" setting, and it is fully implemented server-side and enables more strict chat filtering.

### Notifications

MPP.com sent notifications to clients for certain reasons.
These notifications technically have the ability to be used for malicious purposes, but are controlled by the server, thus not much of a concern.

The fishing bot script would send notifications with the `html` property set, containing images.
This is technically XSS, and can contain `<script>` tags that can be used to execute malicious code.

These notifications may or may not be used by this server, especially in the future, for detecting certain things on the client for various reasons including bot detection and legacy features.

### Tags

The features relating to user tags in this server are toggleable for the simple reason that they don't exist on MPP.com.
Sending this data has no side-effects on older clients, but it is still optional for the sake of full compatibility with bots written in other languages, perhaps.
