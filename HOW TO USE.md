# Customer Relationship App: how to use it

**The problem:** your birthday wishes sound like every other agent's, so customers reply "thank you" and the conversation stops.
**The fix:** each wish carries a poster with your face, mentions 2 things that customer actually cares about, and ends with one specific question, so they reply with real news instead of "thanks".

## One-time setup (5 minutes)

1. **Open the team app on your phone:** https://remembered.dwz-rooms-server.workers.dev
   - Sign in with your email and the 6-digit code sent to you. You stay signed in for 7 days. Only emails your team leader has approved can get in.
   - Open it in Chrome (Android) or Safari (iPhone), then **Add to Home Screen**. It opens like an app with its own candle icon.
   - Your customers and photos stay on your phone only. AI is paid for by the team, with daily limits, so you don't need your own key.
2. In the app, tap **Me**:
   - Choose your face photo (clear, front-facing, just you).
   - **Best poster:** add **My cake photo**, a photo of you holding a birthday cake on a plain background. Tap **Choose my cake photo**, or **Make one with AI from my face photo** (uses 1 of your daily AI pictures, done once). The app removes the background, so you stand on the poster holding the cake. If the background isn't plain, the photo goes in a gold arch frame instead.
   - Enter your name and sign-off (e.g. `Kah Jian · REDEFINE`).
   - Tap **Save my details**.

**For the team leader:** add a teammate in Cloudflare under **Zero Trust → Access controls → Policies → Remembered team → Include → Emails**. Change daily limits in `server/wrangler.toml`, then redeploy. To update the app, edit `docs/index.html`, commit, and redeploy the Worker from `server/` (GitHub Pages is switched off).

## Every birthday (about 2 minutes)

1. **Birthdays** tab: customers are sorted by whose birthday is next. Tap **Create poster**.
2. Pick colours, pattern and artwork style (or leave them on Auto), then tap **Create birthday poster**. The AI artwork takes 30–90 seconds.
3. Read the poster and message, and edit any word. Tap **Update poster with my edits** if you changed the poster line.
4. Tick the 3 checks (nickname, facts, your face), then **Share poster + message** → WhatsApp → the customer. Nothing sends until you tap send in WhatsApp.
5. Tap **Mark as sent**. Next year the app will avoid repeating the same topic.

## Animated poster (optional, the biggest "wow")

The poster shows you holding a birthday cake out to the customer, with "from <your name>" under their name, so it's clearly **their** birthday and **your** wish. With an OpenAI key, the AI paints you holding the cake (pose: **Presenting a cake** or **Singing to them**). Without a key, the Quick design shows your photo with a cake beside it and a speech bubble.

1. After creating the poster, scroll to **Animated poster**.
2. Leave **Add a soft music-box tune** ticked (an original tune, so there are no copyright issues), then tap **Make animated poster**. It takes about 8 seconds. **Keep the screen open** while it works.
3. Watch it. In **Before you send**, choose **Animated poster**, tick all 4 checks, then **Share animated poster + message** → WhatsApp.

Optional: open **Use my own voice instead of music** to record or upload a short voice note. It replaces the tune.

If your phone makes a **WebM** video (some Android browsers), the app warns you. If WhatsApp won't send it, choose **Poster image** instead.

## Three occasions

On **Create**, pick the occasion first:

| Occasion | When | What the poster shows | The message |
| --- | --- | --- | --- |
| 🎂 **Birthday** | Their date of birth | You holding a cake (your cake photo) or a drawn cake | Mentions 2 things they care about, ends with a question |
| 🤝 **Policy anniversary** | Each year from the **policy start date** (add it under Customers → Edit) | "Thank You", a gold laurel medal with the years together | A sincere thank-you for N years of trust. It never says why they bought, what the policy covers, or offers anything. |
| 🧧 **Chinese New Year** | The coming New Year (2027: 6 Feb, Year of the Goat) | 新年快乐 in gold, red lanterns, mandarin oranges and ang pao, zodiac medal | A personal blessing tied to what they care about, wishes only, no promises |

The Customers list shows each customer's next birthday and anniversary, soonest first, with a **Thank-you poster** button when a policy start date is saved. The app won't make an anniversary poster without a real start date, so it never guesses the years.

## Import customers from ePartner

**Best way: copy and paste (no AI, nothing leaves your phone)**
1. In ePartner, open the policy list ("There are a total of … records").
2. Select the whole table from "No." to the last row and copy it.
3. In the app: **Customers → Import from ePartner → Paste ePartner list**, then **Read pasted list**.

The app keeps only **Policy Holder, DOB, Commencement Date and Status**. Policy numbers, premiums, payment details, plan codes and Life Assured are read past and never saved, and the pasted text is cleared.

How it reads the list:
- **Policy Holder** is the customer, and **DOB** is their birthday.
- **Client since = their earliest real policy's Commencement Date**, whether it's still in force or was later surrendered or terminated. Policies that never really started don't count (Withdrawn, Declined, Freelook, "waiting for validate"), nor do policies starting after today. You never type it: the policy anniversary falls on that date each year, and the birthday, anniversary and CNY messages all say the same "N years with you", counted to the occasion's day.
- Several policies for one holder become one customer.
- Holders with **no in-force policy**, and **your own policies**, come in unticked.

Then **check before saving**. Use the filters (Needs a look / New / Updates / No change / All) and Tick all / Untick all. Dates are read as day/month/year. Rows with unreadable dates or 2-digit years must be fixed or unticked.

**Re-import a newer list** the same way: birthdays and policy dates are replaced with the new values, while your nicknames, priorities and message history are kept. Customers not on the new list are shown so you can remove them, but nothing is removed unless you tick it and confirm.

Other ways: **Photo or screenshot (AI)**, for a few rows when you can't copy (it sends the image to the AI, so crop out what you don't need), or **Import CSV file**.

## Reminders

- **Inside the app:** every time you open it, **Coming up in the next 7 days** shows at the top, followed by **This month**. Each has a Create button. On phones that support it, the app icon shows a count.
- **Phone calendar:** **Add new customers to my calendar** creates yearly birthday and anniversary entries that remind you 3 days before and at 9am on the day. **Full calendar + monthly summaries** also adds a summary on the 1st of each month. On iPhone, import into a new calendar called "Customers" so you can replace it later.
- Your customer list stays only on your phone. Keep a backup (Customers → Backup & restore).

## 定联 (Routine Engagement)

**The problem it fixes:** agents give up on 定联 because recording is tedious and nobody tells them who to talk to next, so prospects go cold and get lost.

Open the **定联** tab. The red number on it is how many prospects are due. **Search** is always at the top: type 2–3 letters of a name, remark or last chat.

**Today** (5 minutes a day)
1. The ring shows today's target, **3 D · 3 C · 2 B · 1 A** (smaller if a group has fewer people), plus your 🔥 streak.
2. Below are the exact people to talk to: overdue first, ⭐ favourites on top, each with a chat idea.
3. After chatting, tap **✓ Talked**, then pick the platform and a one-tap note (*Replied story, Commented post, Liked post, Chatted, Sent info, Festival greeting, Voice note*) or type your own. You can change the date if it was yesterday.
4. Finish all of today's chats for confetti 🎉. Talk first, open later: **no sales intention** in 定联 chats.

**How often each group comes back:** A every week · B every 3 weeks · C every 6 weeks · D every 8 weeks.

**All prospects**
- Group counts plus filters: **All · Due · ⭐ · A · B · C · D · Talked this week**, showing 20 at a time with **Show 20 more**.
- **✓ Talked** on every row, so you can chat with anyone **before they're due**. It simply resets their next date.
- **☑ Select many**: tick people, or **Select all**, then in one go **✓ Talked** (same platform and note for everyone, e.g. Instagram · Commented post), **Group** (move all to A/B/C/D), **⭐**, or **🗑** (asks first).

**Adding prospects**
- **+ Add prospects**: type or paste names, one per line, and pick the group. Duplicates are skipped.
- **📷 Photo / screenshot**: WhatsApp chat list, contacts, followers, name card or handwritten list. The AI reads **names only**, and you check them before they're added.

**Prospect details** (tap a name)
- **✓ Log a chat**, any time.
- Group A/B/C/D (you decide), ⭐ favourite, name and remark.
- **Results**: Opened, Presented, Closed (with **ANP in RM** and **NOC**, and any date up to today).
- **History, with Edit on every chat and result.** Fix a wrong ANP, NOC, date, type or note, or delete a record that was saved by mistake. Each change asks you to confirm.

**This week**: chats, active days, opened, presented, closed, NOC, ANP, plus **badges** (5 active days, 30 chats, 3 upgrades, 3 opens/presents, a close) and **🏆 Team ranking by chats**. The ranking counts effort, never sales.

**Pop-ups** (Reminders box on the Today screen): tap **🔔 Turn on pop-ups**, pick the time for your daily reminder, and keep the **9pm nudge** on if you like. The pop-up says how many prospects are due, plus customer birthdays and anniversaries today. Use **Test in 15 s** to check it. iPhone: add the app to your Home Screen first. Names never leave your phone; only counts are used.

**For the Group Manager:** **Team 定联 (numbers only)** at the bottom of Today shows each agent's chats, days, open, present, close, NOC and ANP for this week and last week.

## Adding a customer

- **Nickname, date of birth and at least one priority** are needed. Gender is optional.
- Write priorities as short phrases that fit "I remember…":
  `Chloe starting Primary 1 next year` · `the Penang Bridge half marathon` · `saving up for a first home`
- **Never** enter IC numbers, policy numbers or medical details. The app blocks anything that looks like an IC number.

## What the app does with messy data

| Situation | What happens |
| --- | --- |
| Missing nickname or DOB, future DOB, impossible date | Won't save, and tells you what to fix |
| No priorities | Saves after asking you, and warns that the wish will be generic |
| Born 1 Jan – 20 Feb | Chinese zodiac left blank, because Lunar New Year varies and the app won't guess |
| No API key / AI fails | Falls back to the Quick design + template wording and tells you why |
| Edit, delete, restore backup, replace photo or key | Asks you to confirm first |
| Recording under 3s, over 60s, unreadable or very quiet | Rejects it or warns you, and asks you to record again |
| Poster changed after the animated poster was made | Old video is discarded, and you tap "Make animated poster again" |
| Microphone blocked | Tells you how to allow it, or to upload a voice note instead |

## Good to know

- **Privacy:** customer list, photo and key stay in your phone's browser. Nickname, birthday, priorities and your photo are sent to OpenAI only when you tap Create. Use **Backup & restore** monthly, because clearing browser data erases the list.
- **Cost:** you pay OpenAI per image and per message. Check current prices on OpenAI's pricing page. Medium quality is the sweet spot.
- **Models:** default is `gpt-image-2` for images and `gpt-5-mini` for writing. You can change both in **Me** if OpenAI renames them.
- **Kelly** is a made-up example customer. Delete her once you've added real customers.
