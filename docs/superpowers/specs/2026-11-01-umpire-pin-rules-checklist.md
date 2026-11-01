# Umpire PIN rules: what to test before publishing

`database.rules.json` was changed for the 6-digit umpire PIN, the per-device guess limit and owner-only PIN
changes. **None of these rules has been run anywhere** (no emulator or Rules Playground; the end-to-end
task was skipped because the machine has Java 8 and the emulator needs 11 or newer). Everything below is
reasoned from the rules language, not observed. Test the cases in the Firebase Console Rules Playground, or
with the emulator, **before** publishing the file.

## Deploy order

1. Test the rules (cases below).
2. Publish `database.rules.json` in the Firebase Console.
3. Deploy the new app straight away, and ask hosts to reload once.

New app before the new rules: the umpire's counted try is refused ("Live sync isn't available"), and a host
who starts a New session gets a 6-digit PIN the server refuses. New rules before the new app: old tabs write
`editorClaims` with no counted try and see "Wrong PIN". Umpires who already hold a claim keep working.

## Known limits

- The guess limit is per anonymous uid, not per device. A new uid gets 5 fresh tries. App Check (next
  section) narrows this by refusing database requests that don't come from the real app.
- `attempts/{uid}` entries can't be deleted (deletes are denied by design).
- A correct PIN counts as one of the 5 tries per 10 minutes.
- Rules never reveal whether a guess was right.

## App Check (guess-limit hardening)

The app registers Firebase App Check with the reCAPTCHA v3 provider in `src/lib/firebase.ts`, **only when
`VITE_APPCHECK_SITE_KEY` is set**. With no key (local dev, tests) nothing changes. The code does not change
any enforcement setting; do these console steps yourself, in this order:

1. **Create the reCAPTCHA v3 key.** In the reCAPTCHA admin console create a **v3** site key for the live
   domain (for example `gobadmin.netlify.app`). Keep the **secret key** for step 2.
2. **Register the web app.** Firebase Console > Build > App Check > Apps > your web app > reCAPTCHA v3, then
   paste the **secret key** there.
3. **Ship the site key.** Set `VITE_APPCHECK_SITE_KEY` (the **site** key, not the secret) in the host's build
   environment (Netlify > Site configuration > Environment variables) and redeploy. Ask hosts to reload once.
4. **Monitor, do not enforce yet.** App Check > APIs > Realtime Database shows verified and unverified
   requests. Leave enforcement off and watch for a few days. Old tabs and any device that has not reloaded show
   up as unverified; the share should be close to zero before you move on.
5. **Enforce for Realtime Database.** In the same APIs table choose **Enforce** for Realtime Database. From
   then on, requests without a valid App Check token are refused, so a script that signs in again as a new
   anonymous user can no longer reach `attempts/` to get 5 fresh tries. Enforcement can be switched off again
   from the same screen if something breaks.

Notes:

- Enforcement for other products (Authentication and so on) is a separate switch and is not needed for the
  guess limit; the database is where the tries are counted.
- On a local build with a real key set, register a debug token (App Check > Apps > Manage debug tokens) and set
  `self.FIREBASE_APPCHECK_DEBUG_TOKEN` in the browser console before loading the app. Leaving the key unset is
  simpler for local work.
- A wrong key or an unregistered domain shows as token errors in the browser console. While enforcement is off
  they are warnings only and the app keeps working.
- The rules file is unchanged by App Check. It cannot be tested in the Rules Playground, because App Check is
  enforced before the rules run.

## Cases (authenticated as `u1` unless noted)



Set-up unless a row says otherwise: `pin` = "123456" and `ownerUid` = "owner". "Stored" means the existing value at `attempts/u1` before the operation.

| # | Operation | Expected |
|---|---|---|
| 1 | write `attempts/u1` = `{count:1, at:now, guess:"123456"}` with no prior data | allowed |
| 2 | write `attempts/u1` = `{count:1, at:now, guess:"111111"}`, stored count 3 and `at` 1 min ago | denied |
| 3 | write `editorClaims/u1` = "123456" when `attempts/u1.guess` = "111111" | denied |
| 4 | write `editorClaims/u1` = "123456" with `attempts/u1` = `{count:6, guess:"123456"}` | denied |
| 5 | delete `attempts/u1` (it exists) | denied |
| 6 | read `attempts/u1` as `u1` | allowed |
| 7 | read `attempts/u1` as `u2` | denied |
| 8 | write only `attempts/u1/guess` = "654321", stored `{count:2, at: 1 min ago, guess:"111111"}` | denied |
| 9 | write only `attempts/u1/at` = now, same stored value | denied |
| 10 | write only `attempts/u1/count` = 3, same stored value | denied |
| 11 | write `attempts/u1` = `{count:3, at:now, guess:"111111"}`, stored count 2 and `at` 1 min ago | allowed |
| 12 | write `attempts/u1` = `{count:1, at:now, guess:"123456", extra:1}` with no prior data | denied (`$other`) |
| 13 | delete only `attempts/u1/guess` (stored record exists) | denied |
| 14 | write `attempts/u1` = `{count:1, at:now, guess:"12ab56"}` with no prior data | denied (guess regex) |
| 15 | write `attempts/u1` = `{count:6, at:now, guess:"123456"}`, stored count 5 and `at` 1 min ago | allowed (counted; row 4 shows the claim is then denied) |
| 16 | write `ownerUid` = "someone-else" on a session with no `ownerUid` | denied |
| 17 | write `ownerUid` = "u1" on a session with no `ownerUid` | allowed |
| 18 | write `pin` = "654321" on an existing session, as `owner` | allowed |
| 19 | write `pin` = "654321" on an existing session, as `u1` | denied |
| 20 | write `pin` = "12345" as `owner` | denied (regex) |
| 21 | write `pin` unauthenticated on a session with no `pin` and no `ownerUid` | denied (`auth != null`) |
| 22 | write `editorClaims/u1` = "123456" with `attempts/u1` = `{count:5, guess:"123456"}` | allowed |
| 23 | write `pin` = "654321" as `u1` on a session with `ownerUid` = "owner" and **no** `pin` | **denied** (the old rule allowed it) |
| 24 | write `pin` = "654321" as `owner` on a session with `ownerUid` = "owner" and no `pin` | allowed |
| 25 | write `pin` = "654321" as `u1` on a brand-new session (no `pin`, no `ownerUid`) | allowed (first stamp) |
| 26 | write `pin` = "654321" as `u1` on a session with `pin` but no `ownerUid` | denied |
| 27 | write `pin`, then `ownerUid` = "u1", in that order, as `u1` on a brand-new session | both allowed (what `pushSessionOwnership` does) |

## Final rules file

```json
{
  "rules": {
    "sessions": {
      "$sessionId": {
        "data": {
          ".read": true,
          ".write": "!data.exists() || (root.child('sessions').child($sessionId).child('ownerUid').exists() && auth.uid === root.child('sessions').child($sessionId).child('ownerUid').val()) || (root.child('sessions').child($sessionId).child('pin').exists() && root.child('sessions').child($sessionId).child('editorClaims').child(auth.uid).val() === root.child('sessions').child($sessionId).child('pin').val())",
          ".validate": "!data.exists() || newData.child('rev').val() > data.child('rev').val()"
        },
        "pin": {
          ".write": "auth != null && (root.child('sessions').child($sessionId).child('ownerUid').exists() ? auth.uid === root.child('sessions').child($sessionId).child('ownerUid').val() : !data.exists())",
          ".validate": "newData.isString() && newData.val().matches(/^[0-9]{4}([0-9]{2})?$/)"
        },
        "ownerUid": {
          ".write": "!data.exists()",
          ".validate": "newData.val() === auth.uid"
        },
        "attempts": {
          "$uid": {
            ".read": "auth.uid === $uid",
            ".write": "auth.uid === $uid && newData.hasChildren(['count', 'at', 'guess']) && newData.child('at').val() === now && newData.child('count').val() === ((!data.exists() || data.child('at').val() <= now - 600000) ? 1 : data.child('count').val() + 1)",
            "count": {
              ".validate": "newData.isNumber()"
            },
            "at": {
              ".validate": "newData.isNumber()"
            },
            "guess": {
              ".validate": "newData.isString() && newData.val().matches(/^[0-9]{4}([0-9]{2})?$/)"
            },
            "$other": {
              ".validate": false
            }
          }
        },
        "editorClaims": {
          "$uid": {
            ".write": "auth.uid === $uid",
            ".validate": "newData.val() === root.child('sessions').child($sessionId).child('pin').val() && newData.val() === root.child('sessions').child($sessionId).child('attempts').child($uid).child('guess').val() && root.child('sessions').child($sessionId).child('attempts').child($uid).child('count').val() <= 5"
          }
        }
      }
    }
  }
}
```
