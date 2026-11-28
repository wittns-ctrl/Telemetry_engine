# Lectio user guide

Lectio keeps an eye on your Windows PCs and tells you, in plain words, when
something is wrong and what to do about it.

## 1. Create your account

1. Go to https://getlectio.vercel.app and click **Create free account**, or
   **Continue with Google**.
2. With email: enter your name, email and a password, then the 6-digit code we
   email you.

## 2. Connect a PC

1. On the PC, click **Download for Windows** (on the website, or My Devices).
2. Open `lectio-agent.exe`. If Windows says "Windows protected your PC", click
   **More info → Run anyway** (the program isn't code-signed yet).
3. Click **Yes** when Windows asks for permission.
4. Sign in with your Lectio account when asked, and pick a name for the PC.
5. Wait for "Done. Lectio now runs in the background." The PC appears on your
   dashboard within a minute and keeps reporting whenever it's on.

## 3. Your dashboard

**Summary** answers five questions with a coloured dot:
- Is it too hot? · Is it struggling? · Is my storage OK? · Is anything broken? · Is it safe?

Green means fine; red means something needs a look — click **See what to do**.

**Show advanced details** opens a tab per part (Processor, Graphics, Memory,
Storage…) with live readings and charts, and the **Security** tab.

**The map** shows where your PCs are: by country, or exactly if you switch
location on (see section 7).

## 4. Alerts

When a reading stays outside a safe limit long enough, Lectio raises an alert:
- a pop-up and the **bell** on the dashboard;
- an **email** for warnings and critical alerts (at most one every 30 minutes
  for the same problem on the same PC; switch off in Settings);
- for **critical** alerts, a **notification on the PC** itself, with
  **Open dashboard**.

Open an alert to see **How to fix** and **Why is this happening?**. When you've
dealt with it, click **I've dealt with this**; if the problem is still there,
Lectio raises it again.

## 5. Fixes

Lectio can carry out some fixes on the PC for you:

| Fix | What it does | Can be undone |
| --- | --- | --- |
| Cool it down now | lowers the processor's top speed for a while | yes |
| Switch to the Balanced power plan | stops the PC running at full power | yes |
| Clear temporary files | deletes leftover temp files older than a day | no |
| Close the app using the most power | closes one program (save your work first) | no |
| Stop an app starting with Windows | keeps a program from starting by itself | yes |
| Restart a stuck Windows service | turns a Windows service off and on | no |
| Repair Windows system files / Check the drive | runs Windows' own checks | no |
| Quick scan / Full scan / Update definitions / Remove threats | asks Microsoft Defender to act | no |

Bigger fixes show a Yes/No box **on the PC** first, so nothing happens without
someone there agreeing. In **Settings → Fixes** you choose whether Lectio may
run fixes, only safe ones, or just suggest them.

## 6. Security

The **Security** tab shows whether Microsoft Defender is protecting the PC,
how up to date it is, when it last scanned, and any threats it found, newest
first. Use **Quick scan**, **Update definitions** or **Remove threat** from
there. Lectio never deletes files itself; Defender quarantines them first.

## 7. Location (optional)

On **My Devices**, open a PC and switch on **Show its exact location**.
- The PC finds its position with Windows Location (needs Location turned on in
  Windows Settings → Privacy & security → Location, including "Let desktop apps
  access your location").
- If that isn't available, Lectio shows an **approximate** position (usually
  the city) from the PC's internet address.
- Only you can see it. Switching it off deletes the position and its history.

## 8. Remove a PC or your account

- **Remove a PC:** My Devices → the PC → **Remove**. On the PC itself, to
  uninstall the agent (PowerShell as administrator):
  `& "C:\Program Files\Lectio\lectio-agent.exe" uninstall --purge`
- **Delete your account:** Settings → **Delete account**. Everything is erased
  immediately.

## 9. Help

- The **Help** page in the app answers common questions.
- Contact: [SUPPORT EMAIL]
