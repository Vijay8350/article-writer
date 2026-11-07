# Meta App Review: letting any store connect Instagram

Until Meta approves the app, Facebook only lets people with a role on the Meta app log in.
Everyone else sees "Feature unavailable". This is the path to approval, with text ready to
paste into Meta's forms. Only the app's owner can submit it: Meta needs their login,
business documents and a screen recording.

Expect about 1–3 weeks in total: business verification usually takes a few days, and each
App Review round about 1–2 weeks. Rejections are common the first time; fix the reason
given and resubmit.

## 0. Use a Meta app of its own (recommended)

The current app, "Socia Media Manager" (2442335116241650), is shared with SocialNexus. Its
privacy policy and website point to social.apanjob.com. Reviewers check one product's flow
against one privacy policy, so a shared app is likely to be rejected or approved for the
wrong use. Create a new app for Article Writer:

1. https://developers.facebook.com/apps → **Create app**. Choose the use cases **Manage
   messaging & content on Instagram** and **Manage everything on your Page**. Choose the
   app type **Business**, and connect it to the business portfolio that will be verified.
2. Put its App ID and App Secret in the server `.env` as `FACEBOOK_APP_ID` and
   `FACEBOOK_APP_SECRET`, then run `pm2 reload article-writer-backend --update-env`. Users
   then reconnect their Instagram accounts once.

To keep the shared app instead, change its Basic settings below to the app.jsyxi.com
values. SocialNexus would then show Article Writer's policy.

## 1. App settings → Basic

| Field | Value |
|---|---|
| App domains | `app.jsyxi.com` |
| Privacy Policy URL | `https://app.jsyxi.com/privacy` |
| Terms of Service URL | `https://app.jsyxi.com/terms` |
| User data deletion → Data deletion callback URL | `https://app.jsyxi.com/api/meta/data-deletion` |
| App icon | 1024 × 1024 PNG (`frontend/public/favicon.svg` exported as PNG) |
| Category | Business and pages |
| Contact email | a monitored inbox |

Facebook Login for Business → Settings → **Valid OAuth Redirect URIs**:
`https://app.jsyxi.com/api/meta/oauth/callback`

## 2. Business verification

Business settings → Security Center → **Start verification**. You'll need the company's
legal name, address and phone exactly as on a registration document (GST certificate or
certificate of incorporation), plus a website or email on the same domain.

## 3. A login for the reviewers

New sign-ups wait for approval, so create the reviewer's account first:

1. Sign up at https://app.jsyxi.com with a new email, for example `meta-review@<your domain>`.
2. Approve it in **Admin**, and add it to a workspace that has a Shopify store and
   Business DNA, so every Instagram page works.
3. Put the email and password in the reviewer instructions below.

## 4. Permissions to request (Advanced Access)

Request only these seven. Every one of them is used by a feature the reviewer can see.

**instagram_basic.** Article Writer reads the connected Instagram professional account's
username, profile picture, follower count and recent posts. It shows them under Instagram →
Accounts, and uses them to pick which account a post or reply belongs to. Without it, the
store owner can't see or choose the account they connected.

**instagram_content_publish.** The store owner creates Instagram posts in Article Writer.
These are AI-designed posts built around their real product photos, and quote posts from
Instagram Studio. They publish them to their own account with "Post now", or at times they
schedule. Article Writer only publishes posts the owner created or approved in the app.

**instagram_manage_comments.** Instagram → Comments lists the comments on the owner's
posts. It lets them reply from the app ("Send"), and lets them set auto-reply rules that
answer common questions. Replies always go out under the owner's own account.

**instagram_manage_insights.** Instagram → Insights shows the account's reach, its
followers' demographics and the hours they're online, and each post's reach and saves.
Owners use this to see which posts work and when to post next.

**pages_show_list.** When the owner clicks "Connect with Facebook", Article Writer lists
the Facebook Pages they manage. They can then choose the Page whose linked Instagram
professional account they want to connect.

**pages_read_engagement.** Article Writer reads the chosen Page's linked Instagram
professional account (`instagram_business_account`) and the Page's name. It needs these to
find and connect the right Instagram account.

**business_management.** Most stores own their Page and Instagram account through a
business portfolio. Without this permission, those Pages are missing from the list in the
previous step, and the owner can't connect their account.

## 5. Reviewer instructions (paste into "App verification details")

```
1. Go to https://app.jsyxi.com and sign in:
   Email: <reviewer email>   Password: <reviewer password>
2. In the left menu open Instagram → Accounts and click "Connect with Facebook".
3. Log in to Facebook, choose the Facebook Page that is linked to an Instagram professional
   account, and allow the requested permissions. You return to Instagram Accounts, which
   now lists the account with its username, picture and followers
   (instagram_basic, pages_show_list, pages_read_engagement, business_management).
4. Open Instagram → AI Product Posts, choose a product, and click "Post now". The post is
   published to the connected Instagram account (instagram_content_publish).
5. Open Instagram → Comments, choose a post that has a comment, type a reply and click
   "Send". The reply appears on Instagram (instagram_manage_comments).
6. Open Instagram → Insights to see the account's and its posts' reach and engagement
   (instagram_manage_insights).
```

## 6. The screen recording

Meta judges mostly from the video, so show every step in one recording of 2–4 minutes, in
English, with the browser's address bar visible. Turn on captions or add short on-screen
notes naming each permission as it's used.

1. Sign in to app.jsyxi.com.
2. Instagram → Accounts → **Connect with Facebook**. Show the Facebook dialog listing the
   permissions, the Page selection, and **Allow**.
3. Back in the app, show the connected account.
4. Instagram → AI Product Posts → **Post now**, then show the post on Instagram.
5. Instagram → Comments → reply → **Send**, then show the reply on Instagram.
6. Instagram → Insights, then show the numbers.

Do a full run-through before recording: every step must work on the live site.

## 7. Data handling answers

- **What Instagram/Facebook data is stored:** the account id, username and an encrypted
  access token. Also the posts the owner creates, comment replies, and insight numbers.
  Stored on AWS (EC2 and RDS) in India (ap-south-1).
- **Shared with others:** comment text is sent to an AI provider (DeepSeek) to draft
  replies, only when the owner uses AI replies. Nothing is sold, and no data is used for
  advertising.
- **Deletion:** owners disconnect an account in the app or delete their account. Facebook's
  data deletion callback removes everything for that user and gives them a status link
  (`/data-deletion`).

## 8. After approval

App Review shows each permission as **Advanced Access**. Then switch the app to **Live**
(the Publish button on the app dashboard). From then on any Facebook account can connect,
without being added to the app.
