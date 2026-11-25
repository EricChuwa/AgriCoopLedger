# AgriCoopLedger user guide

For the people who use the system every day: the cooperative Manager, the Collection Clerk and the Payment Officer. It covers signing in, logging deliveries, setting rates (prices) and looking records up (SRS 2.6).

## 1. Who does what

| Role | Their job in the system |
|---|---|
| Manager | Sets up staff and prices, including the selling price. Approves new farmers and payment batches. Corrects or voids wrong entries and decides disputes. Reads reports and the audit log. Does not record deliveries, payments, sales or buyer payments. |
| Collection Clerk | Proposes new farmers. Records every delivery, also without a connection. Can ask a Manager to correct a delivery or raise a dispute on it. Answers buyer order requests and records counter sales and buyer payments. |
| Payment Officer | Records every payment to a farmer and makes payment batches. Confirms or rejects buyer payments. Can raise a dispute on a payment. Reads reports. Cannot see a full national ID number. |

Only the Clerk records deliveries and only the Payment Officer records payments. This keeps one person from both receiving produce and paying for it.

## 2. Signing in and out

1. Open the system in your browser.
2. Enter your **username** (or the phone number on your account) and your password. Then press Sign in.
3. Press Sign out in the side menu when you leave a shared computer.

**Light and dark.** The sun and moon button (top of the landing page and the sign in pages, and in the app menu) switches between a light and a dark screen. The system remembers your choice on that device, and starts from your device setting the first time.

If you do nothing for 15 minutes the system signs you out to protect farmers' data. Sign in again. Anything you had not saved is lost, so save before you walk away.

The sign up page asks what you are signing up as. Choose **Manager** to start a new cooperative: the name must not already be in use, and you can sign in straight away. Choose **Collection Clerk** or **Payment Officer** to join a cooperative that already exists: type its name exactly as the Manager registered it, and the request goes to that Manager instead. If the name is not found, check the spelling. The request appears at the top of **Staff** under *Waiting for your decision*. The Manager presses **Approve**, chooses a role, and the person can then sign in. **Decline** keeps them out, and a declined request can still be approved later. Until then they see a message saying the request is waiting. The Manager can also create accounts directly under **Staff**.

**Change your own password:** open **My account**, enter the current password and a new one. A Manager can also reset a staff password under Staff. The system shows a temporary password once. Give it to the person, who should change it at first sign in.

## 3. Registering a farmer (Clerk or Manager)

1. Open **Farmers**, then **Add farmer** (a Clerk sees **Propose farmer**).
2. Enter the full name and the 16 digit national ID. Phone, village and membership date are optional.
3. Press the button at the bottom.

**Clerk:** the farmer is sent to a Manager and shows as *Waiting for a Manager*. You cannot record deliveries for them until a Manager approves. **Manager:** the farmer is approved at once. A Manager approves or declines waiting farmers from the **Farmers** page (filter **Waiting**), from the farmer's page, or from the dashboard alert, and can add a note.

Each national ID can be registered once in a cooperative. If it is already there the system tells you who has it. To fix a mistake open the farmer and press **Edit**. A farmer who has been paid in full can be deactivated by a Manager. An inactive farmer cannot receive new deliveries or payments, but all their history stays.

## 4. Logging a delivery (Collection Clerk)

**No connection?** Record the delivery as usual. If the network is down, the delivery is kept on your device and shown under *Waiting to send*. It is sent by itself when the connection returns, and only once. If the server refuses one, it stays in the list with the reason. Open the delivery page while you are online first, because reloading the page without a connection will not work. Do not sign out on a shared device with deliveries still waiting.

1. Open **Record delivery**.
2. Choose the **farmer**, the **produce** and the **grade** (A, B or C).
3. Type the **weight in kg** from the scale. Up to three decimals, for example 12.345.
4. Check the **date** (today by default).
5. The slip on the right shows the price per kg and the value. Check it with the farmer, then press **Record delivery**.

The system saves the price that applied on that date. Changing prices later never changes a delivery already recorded. After saving you can print the receipt for the farmer. Receipts are numbered D-000001, D-000002 and so on.

Pressing the button twice does not record the delivery twice.

### If a delivery was wrong

A Clerk cannot edit a saved delivery. Open **Deliveries**, find it, press **Request correction**, enter the right weight or grade and the reason, and send. A Manager sees the request under **Corrections** and approves or rejects it. A Manager cannot approve a request they made themselves.

A Manager can also press **Correct** on a delivery directly, with a reason, or **Void** it. A voided delivery stays on the list, marked Voided, and stops counting towards balances. Nothing is ever deleted.

## 5. Recording a payment (Payment Officer)

1. Open **Record payment** and choose the farmer. The system shows what the farmer is owed.
2. Enter the **amount** in RWF, choose **cash** or **mobile money**, and add the mobile money reference if there is one.
3. Press Record payment. A box shows the farmer, amount and method. Press **Confirm and record** only if it is right.
4. Print the receipt (numbered P-000001 and so on) if the farmer wants one.

The system refuses an amount larger than what is owed. It also refuses a mobile money reference that was already used. A payment recorded in error is voided by a Manager, who must give a reason.

### Paying several farmers together: a payment batch

1. Open **Payment batches**, then **New batch**. Tick the farmers to pay and check the amount for each (it cannot be more than what is owed). Press **Send to Manager for approval**.
2. A Manager opens the batch and approves it, or declines it with a reason. You cannot approve a batch you made.
3. After approval, open the batch and press **Pay** on each farmer's row. Choose cash or mobile money and confirm. Each farmer shows *Not paid*, *Part paid* or *Paid*, and the batch shows the same.

### If something is wrong but the numbers are right

Use **Dispute** on a delivery (Clerk) or a payment (Payment Officer). Give a reason. The record shows **Disputed** until a Manager decides under **Disputes**. The Manager upholds or dismisses it and writes a note of at least 5 characters. Upholding does not change any amount. If a change is needed, the Manager then corrects or voids the record with its own reason. A record can have one open dispute at a time.

### Delivery and payment status

Each delivery shows a status (Recorded, Correction pending, Disputed, Voided) and a payment status (Unpaid, In batch, Part paid, Paid). They are worked out from the records, so they always match them.

### Without a connection

If the connection drops while you save a delivery, it is kept on your device and shown as waiting to send. It is sent once the connection returns. Open the delivery form while you are online first. Reloading the page while offline does not work.

## 6. Setting rates: produce and prices (Manager)

Open **Produce and prices**. Clerks and Payment Officers see the same page as **Prices**, read only.

- **Add produce** creates a new crop, such as Maize or Beans. Give it a price for each grade.
- **Set price** sets a new price per kg for one grade and the date it starts. The old price stays in the history list below.
- **Rename** fixes a spelling. **Stop using** hides a crop from the delivery form without losing its history.

A new price applies to deliveries dated from its start date. Deliveries already recorded keep the price they were recorded with.

**Selling prices.** The same page has a selling price for each produce and grade, set only by the Manager. When you set one, the screen suggests the current buying price plus 20 percent, rounded up to the next 10 RWF. It is only a suggestion, you can type any price. The same price again is refused, and the start date cannot be earlier than the latest one. Sales already made keep their price. Without a selling price a sale cannot be made.

## 6a. Selling to buyers

**Buy page (anyone).** Open the Buy page from the landing page. It shows kilograms in stock for each cooperative, produce and grade, with no prices. A buyer sends an order request with name, phone, produce, grade and weight. It promises nothing. A phone number can have 3 open requests at a cooperative.

**Collection Clerk.** Open **Sales**. Accept an order request (a sale is made from stock at the Manager's selling price) or decline it with a reason. Record a counter sale directly, record a payment from the buyer against a sale (it starts as pending), or void a sale with a reason. A sale cannot be more than the stock.

**Payment Officer.** Confirm or reject pending buyer payments. Only confirmed payments count as paid.

**Manager.** Reads the Sales pages and cannot record or decide anything there.

## 7. Looking things up

- **Farmers:** search by name, phone, village or national ID (the Payment Officer cannot search by ID). Filter for farmers who are owed money or paid up. Open a farmer to see the balance, totals and the full **statement**: every delivery and payment oldest first, with the balance after each line. Pick dates to see just one period. Print it from the farmer's page.
- **Deliveries** and **Payments:** newest first, 25 to a page with Previous and Next. Search by farmer name or receipt number (payments also by reference). Filter by produce, grade, method and dates. The totals above the list cover every page of the filter.
- **Reports** (Manager and Payment Officer): choose
  - *Period summary*: deliveries, kilograms and value by produce and grade, and by farmer, with what was paid and what is still owed.
  - *Farmer statement*: the same statement as on the farmer's page.
  - *Outstanding balances*: everyone who is still owed money, and the total.

  Each report can be printed (choose Save as PDF in the print window) or downloaded as CSV for a spreadsheet.
- **Dashboard:** what was received today and this week, the amount owed to farmers, what needs your attention (for a Manager, corrections and join requests waiting), recent payments and deliveries, the largest balances and a ring showing the produce mix. Use the menu on the ring to switch between this week, this month, last month, this quarter and last quarter.
- **Printing:** Receipts, statements and reports print as plain black and white pages with a header block, whichever theme is on screen.

## 8. Manager tasks

**Staff.** Open **Staff**, then **Add staff member**. Enter the name, an optional username (one is made from the name if you leave it empty), the phone number and the role. Press **Edit** on a row to change a name, username or phone. The other buttons on the row change a role, deactivate or reactivate a person, or reset their password. A deactivated person cannot sign in but their name stays on the records they made.

**Approvals.** Waiting farmers (Farmers page, filter Waiting), payment batches (Payment batches), corrections and disputes show on your dashboard. Approve or uphold, or decline or dismiss with a reason or note. You cannot decide on a farmer or batch that you made yourself.

**Audit log.** Open **Audit log** to see who did what and when: every delivery, payment, correction, void, price change and staff change. Filter by area, person and dates. Nobody can edit or delete an entry. Press **Check integrity** to have the system re-check that no entry has been changed or removed behind its back. A green result means every entry is intact. A red result names the first entry that does not match. Tell whoever looks after the database.

**Cooperative settings.** Change the cooperative's name, district and phone. They appear on receipts and reports.

## 9. Common messages

| You see | What to do |
|---|---|
| "Username or password is wrong" | Check both. Usernames are not case sensitive, passwords are. Ask your Manager for a reset. |
| "You were signed out after 15 minutes" | Sign in again. |
| "No price is set for ... on this date" | A Manager must set that grade's price from that date. |
| "That is more than the ... owed" | Enter the owed amount or less. |
| "... is inactive" | A Manager must reactivate the farmer first. |
| "Waiting for a Manager" | A new farmer or a batch has not been approved yet. Ask a Manager. |
| "You made this ..., so another Manager must decide on it" | The person who proposed it cannot decide it. |
| "You do not have access to this" | Your role does not allow that action. |

## 10. Good habits

- Record each delivery when the produce is weighed, not at the end of the day.
- Give the farmer the printed receipt.
- Never share a password. Ask the Manager to create an account for each person.
- A Manager should check the audit log integrity from time to time, and check that the daily backup files exist.
