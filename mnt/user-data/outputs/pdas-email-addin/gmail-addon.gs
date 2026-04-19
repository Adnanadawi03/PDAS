/**
 * PDAS Gmail Add-on v2.0
 * One-click install: https://workspace.google.com/marketplace
 * 
 * SETUP IN GOOGLE APPS SCRIPT:
 * 1. Go to script.google.com → New Project
 * 2. Paste this entire file
 * 3. Click "Deploy" → "New deployment" → "Add-on"
 * 4. Copy the deployment URL and share it
 */

const API_BASE     = 'https://pdas-engine.onrender.com';
const SUPABASE_URL = 'https://tzujckucxxmbxkpfkngn.supabase.co';
const SUPABASE_KEY = 'sb_publishable_bmXeOrQV8w0DIkslpprzHg_SpmVydR1';
const WEBSITE_URL  = 'https://adnanadawi03.github.io/PDAS';

// ── Homepage (shown when no email open) ──
function buildHomepage(e) {
  const props   = PropertiesService.getUserProperties();
  const userId  = props.getProperty('pdas_user_id');
  const userName = props.getProperty('pdas_user_name');

  const card = CardService.newCardBuilder()
    .setName('PDAS Email Guard')
    .setHeader(
      CardService.newCardHeader()
        .setTitle('PDAS Email Guard')
        .setSubtitle('Phishing Detection & Awareness System')
    );

  if (userId) {
    // Logged in state
    card.addSection(
      CardService.newCardSection()
        .addWidget(CardService.newTextParagraph().setText('✅ Signed in as: <b>' + userName + '</b>'))
        .addWidget(CardService.newTextParagraph().setText('Open any email and click "Scan Email" to check it for phishing.'))
        .addWidget(CardService.newTextButton().setText('📊 Open Dashboard').setOpenLink(CardService.newOpenLink().setUrl(WEBSITE_URL + '/dashboard.html')))
        .addWidget(CardService.newTextButton().setText('🔓 Sign Out').setOnClickAction(CardService.newAction().setFunctionName('signOut')))
    );
  } else {
    // Not logged in — show login form
    card.addSection(
      CardService.newCardSection()
        .setHeader('🔐 Sign In to PDAS')
        .addWidget(CardService.newTextParagraph().setText('Sign in to sync scan results to your PDAS dashboard.'))
        .addWidget(
          CardService.newTextInput()
            .setFieldName('email')
            .setTitle('Email Address')
            .setHint('your@email.com')
        )
        .addWidget(
          CardService.newTextInput()
            .setFieldName('password')
            .setTitle('Password')
            .setHint('••••••••')
        )
        .addWidget(
          CardService.newTextButton()
            .setText('Sign In to PDAS')
            .setTextButtonStyle(CardService.TextButtonStyle.FILLED)
            .setBackgroundColor('#00e5ff')
            .setOnClickAction(CardService.newAction().setFunctionName('signInPDAS'))
        )
        .addWidget(
          CardService.newTextButton()
            .setText('Create Account')
            .setOpenLink(CardService.newOpenLink().setUrl(WEBSITE_URL + '/login.html'))
        )
    );
  }

  return card.build();
}

// ── Sign In ──
function signInPDAS(e) {
  const email    = e.formInput.email;
  const password = e.formInput.password;

  if (!email || !password) return buildErrorCard('Please enter your email and password.');

  try {
    const res = UrlFetchApp.fetch(SUPABASE_URL + '/auth/v1/token?grant_type=password', {
      method: 'post',
      headers: { 'apikey': SUPABASE_KEY, 'Content-Type': 'application/json' },
      payload: JSON.stringify({ email, password }),
      muteHttpExceptions: true
    });

    const data = JSON.parse(res.getContentText());

    if (data.error || !data.access_token) {
      return buildErrorCard('Login failed: ' + (data.error_description || data.error || 'Invalid credentials'));
    }

    // Save session
    const props = PropertiesService.getUserProperties();
    props.setProperty('pdas_access_token', data.access_token);
    props.setProperty('pdas_refresh_token', data.refresh_token || '');
    props.setProperty('pdas_user_id', data.user.id);
    props.setProperty('pdas_user_name', data.user.user_metadata?.full_name || email.split('@')[0]);
    props.setProperty('pdas_user_email', email);

    return buildSuccessCard('✅ Signed in successfully!\n\nOpen any email and click "Scan Email" to check it for phishing.');

  } catch(err) {
    return buildErrorCard('Connection error: ' + err.message);
  }
}

// ── Sign Out ──
function signOut(e) {
  PropertiesService.getUserProperties().deleteAllProperties();
  return buildHomepage(e);
}

// ── Email context card ──
function getContextualAddOn(e) {
  const msg = getEmailData(e);
  return buildEmailCard(msg);
}

function getEmailData(e) {
  try {
    const id  = e.gmail.messageId;
    const msg = GmailApp.getMessageById(id);
    return {
      id:          id,
      subject:     msg.getSubject() || '(no subject)',
      from:        msg.getFrom() || '',
      body:        msg.getPlainBody() || '',
      date:        msg.getDate().toISOString(),
      attachments: msg.getAttachments().map(a => ({ name: a.getName(), size: a.getSize(), type: a.getContentType() }))
    };
  } catch(e) {
    return { id:'', subject:'—', from:'', body:'', date:'', attachments:[] };
  }
}

function buildEmailCard(msg) {
  const props   = PropertiesService.getUserProperties();
  const userId  = props.getProperty('pdas_user_id');

  const card = CardService.newCardBuilder()
    .setName('PDAS Email Guard')
    .setHeader(
      CardService.newCardHeader()
        .setTitle('PDAS Email Guard')
        .setSubtitle(msg.subject.slice(0, 50))
    );

  // Email info
  card.addSection(
    CardService.newCardSection()
      .addWidget(CardService.newTextParagraph().setText(
        '<b>From:</b> ' + msg.from + '<br>' +
        '<b>Subject:</b> ' + msg.subject.slice(0,80) + '<br>' +
        '<b>Attachments:</b> ' + msg.attachments.length
      ))
  );

  // Scan section
  const scanSection = CardService.newCardSection();
  if (userId) {
    scanSection.addWidget(
      CardService.newTextButton()
        .setText('⚡ Scan This Email')
        .setTextButtonStyle(CardService.TextButtonStyle.FILLED)
        .setBackgroundColor('#00e5ff')
        .setOnClickAction(
          CardService.newAction()
            .setFunctionName('scanEmail')
            .setParameters({ msgId: msg.id, from: msg.from, subject: msg.subject })
        )
    );
    scanSection.addWidget(
      CardService.newTextParagraph().setText('<font color="#7a8499">Results saved to your PDAS dashboard automatically</font>')
    );
  } else {
    scanSection.addWidget(
      CardService.newTextParagraph().setText('⚠️ Sign in to PDAS to scan emails and save results to your dashboard.')
    );
    scanSection.addWidget(
      CardService.newTextButton().setText('🔐 Sign In to PDAS').setOpenLink(CardService.newOpenLink().setUrl(WEBSITE_URL + '/login.html'))
    );
  }
  card.addSection(scanSection);

  card.addSection(
    CardService.newCardSection()
      .addWidget(CardService.newTextButton().setText('📊 Dashboard').setOpenLink(CardService.newOpenLink().setUrl(WEBSITE_URL + '/dashboard.html')))
  );

  return card.build();
}

// ── Scan email ──
function scanEmail(e) {
  const msgId   = e.parameters.msgId;
  const from    = e.parameters.from || '';
  const subject = e.parameters.subject || '';

  const props      = PropertiesService.getUserProperties();
  const accessToken = props.getProperty('pdas_access_token');
  const userId      = props.getProperty('pdas_user_id');

  if (!userId) return buildErrorCard('Please sign in to PDAS first.');

  // Refresh token if needed
  const freshToken = refreshTokenIfNeeded(props) || accessToken;

  try {
    const msg  = GmailApp.getMessageById(msgId);
    const body = msg.getPlainBody() || '';

    const urlRegex = /https?:\/\/[^\s]+/g;
    const urls     = [...new Set((body.match(urlRegex) || []))].slice(0, 5);

    let maxScore   = 0;
    let maxVerdict = 'allow';
    const results  = [];

    // Scan sender domain
    const senderMatch = from.match(/@([^>]+)/);
    if (senderMatch) {
      const domain = 'http://' + senderMatch[1].trim().replace(/\s/g,'');
      const r = safeScanUrl(domain);
      if (r) {
        const score = parseFloat(r.score || 0);
        if (score > maxScore) { maxScore = score; maxVerdict = r.verdict || 'allow'; }
        results.push({ item: 'Sender Domain', target: from, verdict: r.verdict, score });
      }
    }

    // Scan URLs in body
    for (const url of urls.slice(0, 4)) {
      const r = safeScanUrl(url);
      if (r) {
        const score = parseFloat(r.score || 0);
        if (score > maxScore) { maxScore = score; maxVerdict = r.verdict || 'allow'; }
        results.push({ item: 'URL', target: url.slice(0,60), verdict: r.verdict, score });
      }
    }

    // Save to Supabase
    if (freshToken && userId) {
      try {
        // Get company_id
        const pRes = UrlFetchApp.fetch(SUPABASE_URL + '/rest/v1/profiles?id=eq.' + userId + '&select=company_id', {
          headers: { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + freshToken },
          muteHttpExceptions: true
        });
        const profiles   = JSON.parse(pRes.getContentText());
        const company_id = profiles[0]?.company_id || null;

        UrlFetchApp.fetch(SUPABASE_URL + '/rest/v1/scan_logs', {
          method: 'post',
          headers: {
            apikey:         SUPABASE_KEY,
            Authorization:  'Bearer ' + freshToken,
            'Content-Type': 'application/json',
            Prefer:         'return=minimal'
          },
          payload: JSON.stringify({
            user_id:    userId,
            company_id: company_id,
            type:       'email',
            target:     from + ' — ' + subject,
            verdict:    maxVerdict,
            score:      maxScore,
            signals:    { from, subject, urls, results }
          }),
          muteHttpExceptions: true
        });
      } catch(err) {
        Logger.log('Supabase save error: ' + err.message);
      }
    }

    return buildScanResultCard(maxVerdict, maxScore, from, subject, results, urls);

  } catch(err) {
    return buildErrorCard('Scan error: ' + err.message);
  }
}

function safeScanUrl(url) {
  try {
    const res = UrlFetchApp.fetch(API_BASE + '/scan/url', {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify({ url }),
      muteHttpExceptions: true,
      followRedirects: true
    });
    if (res.getResponseCode() === 200) return JSON.parse(res.getContentText());
  } catch(e) { Logger.log('Scan error for ' + url + ': ' + e.message); }
  return null;
}

function refreshTokenIfNeeded(props) {
  const refreshToken = props.getProperty('pdas_refresh_token');
  if (!refreshToken) return null;
  try {
    const res = UrlFetchApp.fetch(SUPABASE_URL + '/auth/v1/token?grant_type=refresh_token', {
      method: 'post',
      headers: { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' },
      payload: JSON.stringify({ refresh_token: refreshToken }),
      muteHttpExceptions: true
    });
    const data = JSON.parse(res.getContentText());
    if (data.access_token) {
      props.setProperty('pdas_access_token', data.access_token);
      if (data.refresh_token) props.setProperty('pdas_refresh_token', data.refresh_token);
      return data.access_token;
    }
  } catch(e) {}
  return null;
}

// ── Result cards ──
function buildScanResultCard(verdict, score, from, subject, results, urls) {
  const icons  = { allow:'✅', warn:'⚠️', block:'🚫' };
  const labels = { allow:'Safe Email', warn:'Suspicious Email', block:'⛔ Phishing Detected!' };
  const risk   = score >= 80 ? 'HIGH RISK' : score >= 50 ? 'MEDIUM RISK' : 'LOW RISK';
  const colors = { allow:'#22c55e', warn:'#f59e0b', block:'#ef4444' };

  const card = CardService.newCardBuilder()
    .setName('Scan Result')
    .setHeader(
      CardService.newCardHeader()
        .setTitle(icons[verdict] + ' ' + labels[verdict])
        .setSubtitle('Score: ' + parseFloat(score).toFixed(1) + '/100 — ' + risk)
    );

  let details = '<b>From:</b> ' + from + '<br><b>Subject:</b> ' + subject.slice(0,70) + '<br><b>URLs found:</b> ' + urls.length;
  if (results.length) {
    details += '<br><br><b>Scan breakdown:</b><br>';
    for (const r of results) {
      const icon = r.verdict === 'block' ? '🚫' : r.verdict === 'warn' ? '⚠️' : '✅';
      details += icon + ' ' + r.item + ': ' + parseFloat(r.score||0).toFixed(1) + '/100<br>';
    }
  }
  card.addSection(CardService.newCardSection().addWidget(CardService.newTextParagraph().setText(details)));

  if (verdict === 'block') {
    card.addSection(
      CardService.newCardSection()
        .addWidget(CardService.newTextParagraph().setText('⛔ DO NOT click any links or download attachments from this email. This appears to be a phishing attack.'))
    );
  }

  card.addSection(
    CardService.newCardSection()
      .addWidget(CardService.newTextParagraph().setText('✓ Result saved to your PDAS dashboard'))
      .addWidget(CardService.newTextButton().setText('📊 View in Dashboard').setOpenLink(CardService.newOpenLink().setUrl(WEBSITE_URL + '/email-scans.html')))
  );

  return card.build();
}

function buildSuccessCard(msg) {
  return CardService.newCardBuilder()
    .setName('Success')
    .setHeader(CardService.newCardHeader().setTitle('PDAS Email Guard'))
    .addSection(CardService.newCardSection().addWidget(CardService.newTextParagraph().setText(msg)))
    .build();
}

function buildErrorCard(msg) {
  return CardService.newCardBuilder()
    .setName('Error')
    .setHeader(CardService.newCardHeader().setTitle('PDAS — Error'))
    .addSection(
      CardService.newCardSection()
        .addWidget(CardService.newTextParagraph().setText('❌ ' + msg))
        .addWidget(CardService.newTextButton().setText('Go to PDAS').setOpenLink(CardService.newOpenLink().setUrl(WEBSITE_URL)))
    ).build();
}
