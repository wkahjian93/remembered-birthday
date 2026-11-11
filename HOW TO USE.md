# Customer Relationship App: how to use it

**The problem:** your birthday wishes sound like every other agent's, so customers reply "thank you" and the conversation stops.
**The fix:** each wish carries a poster with your face, mentions 2 things that customer actually cares about, and ends with one specific question, so they reply with real news instead of "thanks".

## One-time setup (5 minutes)

1. **Open the app on your phone:** https://wkahjian93.github.io/remembered-birthday/
   - Open it in Chrome (Android) or Safari (iPhone), then **Add to Home Screen**. It opens like an app with its own candle icon.
   - Your customers, photo and key stay on that phone only. Anyone else opening the link sees an empty app (just the Kelly example).
   - To update the app: edit `docs/index.html`, commit, and push to GitHub. Pages republishes it in about a minute.
2. **Get an OpenAI API key** at platform.openai.com → API keys. Then:
   - Add billing credit and **set a monthly spending limit** (e.g. USD 10).
   - Complete **Organization Verification**. OpenAI requires it before image models work.
3. In the app, tap **Me**:
   - Choose your face photo (clear, front-facing, just you).
   - **Best poster:** add **My cake photo**, a photo of you holding a birthday cake on a plain background. Tap **Choose my cake photo**, or **Make one with AI from my face photo** (one OpenAI image, done once). The app removes the background, so you stand on the poster holding the cake. If the background isn't plain, the photo goes in a gold arch frame instead.
   - Enter your name and sign-off (e.g. `Kah Jian · REDEFINE`).
   - Paste your API key and tap **Test connection**. It should say `gpt-image-2 is available`.
   - Tap **Save my details**.

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
- **Anniversary = earliest Commencement Date of an Inforce policy.** Terminated, Withdrawn and Declined policies don't count. A policy starting after today counts from next year.
- Several policies for one holder become one customer.
- Holders with **no in-force policy**, and **your own policies**, come in unticked.

Then **check before saving**. Use the filters (Needs a look / New / Updates / No change / All) and Tick all / Untick all. Dates are read as day/month/year. Rows with unreadable dates or 2-digit years must be fixed or unticked.

**Re-import a newer list** the same way: birthdays and policy dates are replaced with the new values, while your nicknames, priorities and message history are kept. Customers not on the new list are shown so you can remove them, but nothing is removed unless you tick it and confirm.

Other ways: **Photo or screenshot (AI)**, for a few rows when you can't copy (it sends the image to the AI, so crop out what you don't need), or **Import CSV file**.

## Reminders

- **Inside the app:** every time you open it, **Coming up in the next 7 days** shows at the top, followed by **This month**. Each has a Create button. On phones that support it, the app icon shows a count.
- **Phone calendar:** **Add new customers to my calendar** creates yearly birthday and anniversary entries that remind you 3 days before and at 9am on the day. **Full calendar + monthly summaries** also adds a summary on the 1st of each month. On iPhone, import into a new calendar called "Customers" so you can replace it later.
- Your customer list stays only on your phone. Keep a backup (Customers → Backup & restore).

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
