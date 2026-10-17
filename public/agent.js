/* Lashed By Tash: booking assistant. Recommends treatments, answers questions from the site's own
   content (agent-data.js), hands off to Booksy and sends booking requests to Tash (Netlify form
   "booking-request"). With LBT_AGENT.ai on, typed questions go to Claude via /.netlify/functions/agent
   and fall back to the built-in answers if that fails. */
(function () {
  'use strict';
  var K = window.LBT_AGENT;
  if (!K) return;
  var S = K.site, BY = {};
  K.items.forEach(function (i) { BY[i.slug] = i; });
  var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var KEY = 'lbt-agent-v1';

  var esc = function (s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var rand = function (p) { return parseInt(String(p).replace(/[^\d]/g, ''), 10) || 0; };
  var from = function (it) { return it.prices.reduce(function (a, p) { return !a || rand(p[2]) < rand(a) ? p[2] : a; }, ''); };
  var wa = function (text) { return 'https://wa.me/' + S.whatsapp + (text ? '?text=' + encodeURIComponent(text) : ''); };
  var ext = ' target="_blank" rel="noopener"';
  var ICON = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M4 5h16v11H9l-5 4z"/><path d="M8 9.5h8M8 12.5h5"/></svg>';
  var SEND = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';
  var CLOSE = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';

  /* ---------- markup ---------- */
  var launch = document.createElement('button');
  launch.type = 'button'; launch.className = 'ag-launch';
  launch.setAttribute('aria-expanded', 'false'); launch.setAttribute('aria-controls', 'ag-panel');
  launch.innerHTML = ICON + '<span>Ask &amp; book</span>';
  var panel = document.createElement('div');
  panel.className = 'ag-panel'; panel.id = 'ag-panel'; panel.hidden = true;
  panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-labelledby', 'ag-title');
  panel.innerHTML =
    '<div class="ag-head"><div><p class="ag-title" id="ag-title">Booking assistant</p>' +
    '<p class="ag-sub">' + (K.ai ? 'AI assistant' : 'Demo') + ' · answers come from this website</p></div>' +
    '<button type="button" class="ag-x" aria-label="Close booking assistant">' + CLOSE + '</button></div>' +
    '<div class="ag-log" role="log" aria-live="polite" aria-label="Conversation"></div>' +
    '<form class="ag-form" autocomplete="off"><label class="sr" for="ag-in">Type a question</label>' +
    '<input id="ag-in" type="text" maxlength="500" enterkeyhint="send" placeholder="Ask about lashes, prices or booking">' +
    '<button type="submit" class="ag-send" aria-label="Send">' + SEND + '</button></form>';
  document.body.appendChild(panel); document.body.appendChild(launch);
  var log = panel.querySelector('.ag-log'), form = panel.querySelector('.ag-form'), input = panel.querySelector('#ag-in');

  /* ---------- state (kept for the visit, so the chat follows you between pages) ---------- */
  var st = { flow: null, hist: [], started: false };
  var save = function () {
    try {
      var msgs = log.children; while (msgs.length > 60) log.removeChild(msgs[0]);
      sessionStorage.setItem(KEY, JSON.stringify({ html: log.innerHTML, st: st, open: !panel.hidden }));
    } catch (e) { /* storage off: the chat simply starts fresh on the next page */ }
  };
  var saved = null;
  try { saved = JSON.parse(sessionStorage.getItem(KEY) || 'null'); } catch (e) { saved = null; }
  if (saved) { log.innerHTML = saved.html || ''; st = saved.st || st; }

  /* ---------- rendering ---------- */
  var scroll = function () { log.scrollTop = log.scrollHeight; };
  var add = function (cls, html) {
    var m = document.createElement('div'); m.className = 'ag-msg ' + cls; m.innerHTML = html;
    log.appendChild(m); scroll(); save(); return m;
  };
  var say = function (html) { return add('bot', html); };
  var you = function (text) { return add('you', esc(text)); };
  var chip = function (label, act) { return '<button type="button" class="ag-chip" data-act="' + esc(act) + '">' + esc(label) + '</button>'; };
  var chips = function (list) { return add('chips', list.map(function (c) { return chip(c[0], c[1]); }).join('')); };
  var booksy = function (label) { return '<a class="ag-btn solid" href="' + esc(S.booksy) + '"' + ext + '>' + esc(label || 'Book on Booksy') + '</a>'; };
  var list = function (rows) { return '<ul>' + rows.map(function (r) { return '<li>' + r + '</li>'; }).join('') + '</ul>'; };
  var ptable = function (rows) {
    return '<table class="ag-prices"><tbody>' + rows.map(function (p) {
      return '<tr><td>' + esc(p[0]) + (p[1] ? '<small>' + esc(p[1]) + '</small>' : '') + '</td><td>' + esc(p[2]) + '</td></tr>';
    }).join('') + '</tbody></table>';
  };
  var card = function (it) {
    var course = it.kind === 'course';
    return '<div class="ag-card"><p class="ag-cat">' + esc(it.cat) + '</p><p class="ag-name">' + esc(it.name) + '</p>' +
      '<p class="ag-meta">' + (course ? esc(it.prices[0][2]) + ' · ' + esc(it.prices[0][1]) : 'From ' + esc(from(it)) + ' · ' + esc(it.prices[0][1])) + '</p>' +
      '<div class="ag-btns">' + booksy(course ? 'Book training' : 'Book on Booksy') +
      '<a class="ag-btn" href="' + esc(it.url) + '">Details</a>' + chip('Request a time', 'request:' + it.slug) + '</div></div>';
  };
  var typing = function (fn) {
    var t = add('bot ag-typing', '<span></span><span></span><span></span>');
    t.setAttribute('aria-hidden', 'true');
    setTimeout(function () { t.remove(); fn(); save(); }, reduce ? 0 : 380);
  };

  /* ---------- understanding typed text ---------- */
  var norm = function (t) { return ' ' + t.toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9:+&\- ]+/g, ' ').replace(/\s+/g, ' ').trim() + ' '; };
  var has = function (low, phrase) { return low.indexOf(' ' + phrase + ' ') > -1; };
  var findItem = function (low) {
    var best = null, score = 0;
    K.items.forEach(function (it) {
      it.kw.concat([it.name.toLowerCase().replace(/[^a-z0-9& ]/g, '')]).forEach(function (p) {
        if (p && has(low, p) && p.length > score) { best = it; score = p.length; }
      });
    });
    return best;
  };
  var R = {
    greet: /^ (hi|hey|hello|hallo|howzit|good (morning|afternoon|evening))( there)? $/,
    thanks: / (thanks|thank you|thank u|cheers|awesome|perfect|great) /,
    request: / (request|call me|call back|callback|contact me|get hold of me|send my details) /,
    human: / (whatsapp|speak to|talk to|human|real person|phone number|your number|email address|email you|call you) /,
    recommend: / (recommend|suggest|which|what should|not sure|unsure|help me choose|best for|right for me|advice|first time|never had) /,
    book: / (book|booking|appointment|appointments|available|availability|slot|slots|schedule|reserve|come in) /,
    price: / (price|prices|pricing|cost|costs|how much|rand|fee|fees|expensive|cheap|r ?[0-9]+) /,
    duration: / (how long|duration|takes|take long|time does) /,
    last: / (last|lasts|retention|stay on|fall out) /,
    after: / (aftercare|after care|look after|care for|shower|swim|sleep|wash|oil|steam|sauna|get them wet) /,
    hours: / (hours|open|opening|close|closing|weekend|saturday|sunday|public holiday|evening appointment) /,
    where: / (where|address|location|located|directions|parking|find you|map) /,
    pay: / (pay|paying|payment|cash|card|eft|snapscan|zapper) /,
    cancel: / (cancel|cancelling|canceling|cancellation|reschedule|move my|change my|late|no show|missed) /,
    guest: / (bring|friend|child|children|kid|kids|baby|guest|partner|mom|mother|daughter) /,
    hygiene: / (hygiene|hygienic|clean|sanitise|sanitize|disinfect) /,
    prep: / (prepare|prep|before my appointment|make up|makeup|mascara on|arrive) /,
    sensitive: / (sensitive|allergy|allergic|allergies|reaction|irritation|irritated|itchy|watery|contact lenses|pregnant|patch test) /,
    products: / (mapping|eye pads|eye pad|products|product|shop|buy|kit) /,
    training: / (course|courses|training|train|learn|academy|student|certificate|become a lash|lash artist|teach) /
  };
  var faqBy = function (re) { for (var i = 0; i < K.faq.length; i++) if (re.test(K.faq[i][0])) return K.faq[i]; return null; };
  var STOP = ' a an the i im my me you your we our is are do does can could would should to of for in on at it be and or with how what when where why which this that there have has get about please lashes lash '.split(' ');
  var words = function (t) { return norm(t).trim().split(' ').filter(function (w) { return w.length > 2 && STOP.indexOf(w) < 0; }).map(function (w) { return w.replace(/(ing|es|s)$/, ''); }); };
  var faqSearch = function (text) {
    var q = words(text), best = null, top = 0;
    K.faq.forEach(function (f) {
      var qs = words(f[0]), as = words(f[1]), s = 0;
      q.forEach(function (w) { if (qs.indexOf(w) > -1) s += 2; else if (as.indexOf(w) > -1) s += 1; });
      if (s > top) { top = s; best = f; }
    });
    return top >= 2 ? best : null;
  };

  /* ---------- answers ---------- */
  var MAIN = [['Help me choose', 'quiz'], ['Prices', 'prices'], ['Book an appointment', 'book'], ['Request a time', 'request'], ['Lash training', 'courses'], ['Training products', 'products'], ['Hours & location', 'where']];
  var next = function (it) {
    var c = [];
    if (it) { c.push(['Prices for ' + it.name, 'prices:' + it.slug]); if (it.aftercare && it.aftercare.length) c.push(['Aftercare', 'after:' + it.slug]); c.push(['Book this', 'book:' + it.slug]); }
    c.push(['Help me choose', 'quiz'], ['Something else', 'menu']);
    chips(c);
  };
  var greet = function () {
    var slug = (location.pathname.split('/').pop() || '').replace(/\.html$/, ''), it = BY[slug];
    if (it) {
      say('<p>Hi! Questions about <b>' + esc(it.name) + '</b>? I can show prices, help you choose or get you booked.</p>');
      chips([['Prices for ' + it.name, 'prices:' + it.slug], ['Book this', 'book:' + it.slug], ['Help me choose', 'quiz'], ['Something else', 'menu']]);
    } else {
      say('<p>Hi, I’m the Lashed By Tash booking assistant. I can help you choose a treatment, answer questions and get you booked.</p><p>Tap an option or type your question.</p>');
      chips(MAIN);
    }
  };
  var describe = function (it) {
    var h = '<p>' + esc(it.intro) + '</p>';
    if (it.kind === 'course') {
      h += '<p><b>You’ll learn:</b></p>' + list(it.learn.map(esc)) + '<p><b>Included:</b></p>' + list(it.includes.map(esc));
      if (it.note) h += '<p class="ag-note">' + esc(it.note) + '</p>';
    }
    else if (it.ideal && it.ideal.length) h += '<p><b>Ideal for:</b> ' + esc(it.ideal.slice(0, 3).join(', ').toLowerCase()) + '.</p>';
    say(h + card(it)); next(it);
  };
  var showPrices = function (it, low) {
    var rows = it.prices;
    if (low && / fill/.test(low)) { var f = rows.filter(function (p) { return /fill/i.test(p[0]); }); if (f.length) rows = f; }
    else if (low && / full set/.test(low)) { var g = rows.filter(function (p) { return /full set/i.test(p[0]); }); if (g.length) rows = g; }
    var note = /fill/i.test(rows.map(function (p) { return p[0]; }).join(' ')) ? '<p class="ag-note">Fills are priced by time since your last appointment. More than about 40% of your set should still be in place.</p>' : '';
    say('<p><b>' + esc(it.name) + '</b> prices:</p>' + ptable(rows) + note + '<div class="ag-btns">' + booksy() + '<a class="ag-btn" href="prices.html">All prices</a></div>');
    next(it);
  };
  var overview = function () {
    var rows = K.items.filter(function (i) { return i.kind === 'treatment'; }).map(function (i) { return '<a href="' + esc(i.url) + '">' + esc(i.name) + '</a>: from ' + esc(from(i)); });
    var courses = K.items.filter(function (i) { return i.kind === 'course'; });
    rows.push('<a href="training.html">Lash training</a>: from ' + esc(courses.map(function (c) { return c.prices[0][2]; }).sort(function (a, b) { return rand(a) - rand(b); })[0]));
    say('<p>Here’s where our prices start:</p>' + list(rows) + '<p class="ag-note">Card payments only. Prices as listed on Booksy.</p><div class="ag-btns"><a class="ag-btn" href="prices.html">Full price list</a></div>');
    chips([['Help me choose', 'quiz'], ['Book an appointment', 'book'], ['Something else', 'menu']]);
  };
  var aftercare = function (it) {
    if (!it.aftercare || !it.aftercare.length) { say('<p>There’s no special aftercare listed for ' + esc(it.name) + '. If you’re unsure, WhatsApp Tash on <a href="' + wa() + '"' + ext + '>' + esc(S.phone) + '</a>.</p>'); return next(it); }
    say('<p>Aftercare for <b>' + esc(it.name) + '</b>:</p>' + list(it.aftercare.map(esc))); next(it);
  };
  var bookItem = function (it) {
    say('<p>To book <b>' + esc(it.name) + '</b>, open Booksy, choose the option you want and pick a time that suits you. You’ll get a confirmation from Booksy straight away.</p>' +
      '<p class="ag-note">' + esc(S.hours) + ', appointment only. Card payments only; please give 24 hours’ notice to change.</p>' +
      '<div class="ag-btns">' + booksy('Open Booksy') + chip('Send Tash a request instead', 'request:' + it.slug) + '</div>');
  };
  var bookMenu = function () {
    say('<p>Appointments are booked on Booksy, where you can see open times and confirm straight away. What would you like to book?</p><div class="ag-btns">' + booksy('Go straight to Booksy') + '</div>');
    chips([['Lash extensions', 'quiz:ext'], ['Lash lift or tint', 'quiz:noext'], ['Brows', 'quiz:brow'], ['Facial waxing', 'book:facial-waxing'], ['Lash training', 'quiz:learn'], ['Send Tash a request', 'request']]);
  };
  var where = function () {
    say('<p><b>' + esc(S.address.join(', ')) + '</b></p><p>' + esc(S.hours) + ', by appointment only.</p>' +
      '<div class="ag-btns"><a class="ag-btn" href="https://www.google.com/maps/search/?api=1&amp;query=' + encodeURIComponent('Polo Village Offices Val de Vie Paarl') + '"' + ext + '>Directions</a>' +
      '<a class="ag-btn" href="tel:' + esc(S.tel) + '">Call ' + esc(S.phone) + '</a></div>');
    chips([['Book an appointment', 'book'], ['Something else', 'menu']]);
  };
  var faqAnswer = function (f, extra) { say('<p>' + esc(f[1]) + '</p>' + (extra || '')); chips([['Book an appointment', 'book'], ['Something else', 'menu']]); };
  var human = function () {
    say('<p>You can reach Tash directly:</p><div class="ag-btns"><a class="ag-btn solid" href="' + wa('Hi Tash, ') + '"' + ext + '>WhatsApp</a><a class="ag-btn" href="tel:' + esc(S.tel) + '">Call ' + esc(S.phone) + '</a><a class="ag-btn" href="mailto:' + esc(S.email) + '">Email</a></div>');
    chips([['Request a time', 'request'], ['Something else', 'menu']]);
  };
  var fallback = function () {
    say('<p>I’m not sure about that one, and I’d rather not guess. Tash can help on WhatsApp, or pick a topic below.</p><div class="ag-btns"><a class="ag-btn" href="' + wa('Hi Tash, ') + '"' + ext + '>WhatsApp Tash</a></div>');
    chips(MAIN);
  };

  var answer = function (text) {
    var low = norm(text), it = findItem(low), t = function (k) { return R[k].test(low); };
    if (R.greet.test(low)) return greet();
    if (t('request')) return startRequest(it);
    if (it && t('price')) return showPrices(it, low);
    if (it && t('after')) return aftercare(it);
    if (it && t('book')) return bookItem(it);
    if (it && t('duration')) { say('<p>How long <b>' + esc(it.name) + '</b> takes:</p>' + ptable(it.prices)); return next(it); }
    if (t('sensitive')) {
      var g = K.goals.filter(function (x) { return x.slug === 'sensitive-eyes'; })[0];
      say('<p>' + esc(g.intro) + '</p><p>For anything medical, please WhatsApp Tash before you book so she can advise you.</p><div class="ag-btns"><a class="ag-btn" href="goal-sensitive-eyes.html">Sensitive eyes</a><a class="ag-btn" href="' + wa('Hi Tash, I have a question about sensitive eyes: ') + '"' + ext + '>WhatsApp Tash</a></div>');
      return chips([['Help me choose', 'quiz'], ['Something else', 'menu']]);
    }
    if (it && t('last') && it.results) { say('<p>' + esc(it.results) + '</p>'); return next(it); }
    if (it) return describe(it);
    if (t('last') && / (lashes|extensions|set) /.test(low)) {
      say('<p>It depends on your natural lash cycle and aftercare. Fills are booked within one to three weeks of your last appointment, and more than about 40% of your set should still be in place for a fill.</p>');
      return chips([['Fill prices', 'prices:lash-fills'], ['Aftercare', 'after:classic-lashes'], ['Something else', 'menu']]);
    }
    if (t('cancel')) return faqAnswer(faqBy(/cancel/i));
    if (t('pay')) return faqAnswer(faqBy(/pay/i));
    if (t('guest')) return faqAnswer(faqBy(/bring/i));
    if (t('hygiene')) return faqAnswer(faqBy(/hygien/i));
    if (t('prep')) return faqAnswer(faqBy(/arrive/i));
    if (/ fill/.test(low)) return describe(BY['lash-fills']);
    if (t('where') || t('hours')) return where();
    if (t('products')) return act('products');
    if (t('training')) return act('courses');
    if (t('recommend')) return act('quiz');
    if (t('price')) return overview();
    if (t('book')) return bookMenu();
    if (t('human')) return human();
    if (t('thanks')) { say('<p>It’s a pleasure. Anything else I can help with?</p>'); return chips(MAIN); }
    var f = faqSearch(text);
    if (f) return faqAnswer(f);
    fallback();
  };

  /* ---------- recommend: a short quiz ---------- */
  var recommend = function (slug, mode) {
    var it = BY[slug], rows = it.prices, h;
    if (mode === 'fill') {
      var word = it.name.split(' ')[0].toLowerCase().replace('light', 'volume');
      rows = BY['lash-fills'].prices.filter(function (p) { return p[0].toLowerCase().indexOf(word) === 0; });
      h = '<p>You’ll want a <b>' + esc(it.name.toLowerCase()) + ' fill</b>. More than about 40% of your set should still be in place; otherwise we may need to book a full set.</p>' + ptable(rows.length ? rows : BY['lash-fills'].prices) + card(BY['lash-fills']);
    } else {
      var full = rows.filter(function (p) { return /full set/i.test(p[0]); });
      h = '<p>I’d suggest <b>' + esc(it.name) + '</b>. ' + esc(it.intro) + '</p>' + (full.length ? ptable(full) : '') + card(it) +
        '<p class="ag-note">Every appointment starts with a consultation, so Tash can fine-tune the plan with you.</p>';
    }
    say(h); next(it);
  };
  var QUIZ = {
    'quiz': ['What are you looking for?', [['Lash extensions', 'quiz:ext'], ['Lashes without extensions', 'quiz:noext'], ['Brows', 'quiz:brow'], ['Facial waxing', 'pick:facial-waxing'], ['Learn to do lashes', 'quiz:learn']]],
    'quiz:ext': ['What look do you love?', [['Natural, like mascara', 'quiz:have:classic-lashes'], ['Soft and a little fuller', 'quiz:have:hybrid-lashes'], ['Full and fluffy', 'quiz:have:volume-lashes'], ['Bold and dramatic', 'quiz:have:mega-volume-lashes'], ['Textured wet look', 'quiz:have:wet-look-lashes'], ['Not sure yet', 'quiz:unsure']]],
    'quiz:noext': ['What would you like?', [['Lift and curl my own lashes', 'quiz:lift'], ['Darker lashes', 'pick:eyelash-tint'], ['Lash lift and brows together', 'pick:lash-lift-brow-lami']]],
    'quiz:brow': ['What would you like for your brows?', [['A tidy shape', 'pick:brow-shaping'], ['Shape and colour', 'pick:brow-sculpt-tint'], ['Full, brushed-up brows', 'pick:brow-lamination'], ['Brows and a lash lift', 'pick:lash-lift-brow-lami']]],
    'quiz:learn': ['Where are you in your lash journey?', [['Brand new to lashing', 'pick:course-classic'], ['I do classic, I want volume', 'pick:course-volume'], ['I want to learn both', 'pick:course-bundle'], ['I’m a lash artist levelling up', 'pick:course-masterclass']]]
  };
  var act = function (a) {
    var p = a.split(':'), it = BY[p[1]];
    if (QUIZ[a]) { say('<p>' + esc(QUIZ[a][0]) + '</p>'); return chips(QUIZ[a][1]); }
    switch (p[0]) {
      case 'menu': say('<p>What can I help with?</p>'); return chips(MAIN);
      case 'pick': return p[1].indexOf('course') === 0 || !BY[p[1]].kw.length ? describe(it) : recommend(p[1]);
      case 'prices': return it ? showPrices(it) : overview();
      case 'after': return aftercare(it);
      case 'book': return it ? bookItem(it) : bookMenu();
      case 'request': return startRequest(it || null);
      case 'where': return where();
      case 'products':
        say('<p>Training products for lash students and artists:</p>' + ptable(K.products.map(function (p) { return [p[0], p[2], p[1]]; })) +
          '<p class="ag-note">Listed on our Booksy page. To ask about stock, WhatsApp Tash.</p><div class="ag-btns"><a class="ag-btn" href="training-products.html">Training products</a><a class="ag-btn" href="' + wa('Hi Tash, I’d like to order ') + '"' + ext + '>WhatsApp Tash</a></div>');
        return chips([['Lash courses', 'courses'], ['Something else', 'menu']]);
      case 'courses':
        var cs = K.items.filter(function (i) { return i.kind === 'course'; });
        say('<p>Tash teaches every course herself, online or in person, in small groups or one-on-one. Each includes a certificate and ongoing support.</p>' +
          ptable(cs.map(function (c) { return [c.name, c.prices[0][1], c.prices[0][2]]; })) + '<div class="ag-btns"><a class="ag-btn" href="training.html">All courses</a></div>');
        return chips(cs.map(function (c) { return [c.name, 'pick:' + c.slug]; }).concat([['Which course suits me?', 'quiz:learn'], ['Training products', 'products']]));
      case 'ans': return flowAnswer(a.slice(4));
      case 'quiz':
        if (p[1] === 'have') { say('<p>Do you have lash extensions on at the moment?</p>'); return chips([['No, I’m starting fresh', 'quiz:full:' + p[2]], ['Yes, I need a fill', 'quiz:fill:' + p[2]], ['Yes, I want them removed', 'pick:lash-removal']]); }
        if (p[1] === 'full') return recommend(p[2]);
        if (p[1] === 'fill') return recommend(p[2], 'fill');
        if (p[1] === 'lift') { say('<p>Two ways to lift your own lashes, both with a tint:</p>' + card(BY['lash-lift']) + card(BY['korean-lash-lift'])); return next(BY['lash-lift']); }
        if (p[1] === 'unsure') {
          say('<p>No problem: every appointment starts with a consultation. For a first set, most people start with <b>classic</b> (most natural) or <b>hybrid</b> (a little fuller).</p>' + card(BY['classic-lashes']) + card(BY['hybrid-lashes']));
          return chips([['Compare more looks', 'quiz:ext'], ['Book an appointment', 'book'], ['Something else', 'menu']]);
        }
    }
    fallback();
  };

  /* ---------- booking request: collect details, send to Tash ---------- */
  var DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
  var ask = function (step) {
    st.flow.step = step;
    var c = [['Cancel request', 'ans:__cancel']];
    if (step === 'what') { say('<p>Which treatment or course is it for?</p>'); chips(K.items.filter(function (i) { return i.kind !== 'service'; }).map(function (i) { return [i.name, 'ans:' + i.slug]; }).concat([['Not sure, I’d like advice', 'ans:Not sure, would like advice']])); }
    else if (step === 'option') { say('<p>Which option?</p>'); chips(BY[st.flow.d.slug].prices.slice(0, 12).map(function (p) { return [p[0] + ', ' + p[2], 'ans:' + p[0] + ', ' + p[2]]; }).concat([['Not sure', 'ans:Not sure']])); }
    else if (step === 'name') { say('<p>What’s your name?</p>'); chips(c); }
    else if (step === 'phone') { say('<p>And your cellphone number, so Tash can confirm by WhatsApp or a call?</p>'); chips(c); }
    else if (step === 'days') { say('<p>Which day suits you best? Tash works ' + esc(S.hours) + '.</p>'); chips(DAYS.map(function (d) { return [d, 'ans:' + d]; }).concat([['Any weekday', 'ans:Any weekday']])); }
    else if (step === 'time') { say('<p>What time of day?</p>'); chips([['Morning (9 to 12)', 'ans:Morning'], ['Midday (12 to 2)', 'ans:Midday'], ['Afternoon (2 to 5)', 'ans:Afternoon'], ['Any time', 'ans:Any time']]); }
    else if (step === 'notes') { say('<p>Anything Tash should know? For example, it’s your first set, the date of your last fill, or sensitive eyes.</p>'); chips([['Nothing to add', 'ans:-']]); }
    else if (step === 'confirm') {
      var d = st.flow.d;
      say('<p>Here’s your request:</p><dl class="ag-sum"><dt>Treatment</dt><dd>' + esc(d.treatment) + (d.option ? ', ' + esc(d.option) : '') + '</dd><dt>Name</dt><dd>' + esc(d.name) + '</dd><dt>Phone</dt><dd>' + esc(d.phone) + '</dd><dt>When</dt><dd>' + esc(d.days) + ', ' + esc(d.time) + '</dd>' + (d.notes ? '<dt>Notes</dt><dd>' + esc(d.notes) + '</dd>' : '') + '</dl>' +
        '<p class="ag-note">Your details go only to Tash, to arrange your appointment. See our <a href="privacy.html">privacy page</a>.</p>');
      chips([['Send request', 'ans:__send'], ['Start over', 'ans:__restart'], ['Cancel', 'ans:__cancel']]);
    }
  };
  var startRequest = function (it) {
    st.flow = { type: 'req', step: '', d: {} };
    say('<p>I’ll take a few details and send them to Tash, who will confirm a time with you. It isn’t booked until she confirms; to lock in a time right now, use Booksy.</p>');
    if (it) { st.flow.d.slug = it.slug; st.flow.d.treatment = it.name; return ask(it.prices.length > 1 ? 'option' : 'name'); }
    ask('what');
  };
  var send = function () {
    var d = st.flow.d, body = new URLSearchParams({ 'form-name': 'booking-request', treatment: d.treatment, option: d.option || '', name: d.name, phone: d.phone, day: d.days, time: d.time, notes: d.notes || '', page: location.pathname });
    var msg = 'Hi Tash, I’d like to book ' + d.treatment + (d.option ? ' (' + d.option + ')' : '') + '. ' + d.days + ', ' + d.time + '. ' + d.name + ', ' + d.phone + (d.notes ? '. ' + d.notes : '');
    var done = function (ok) {
      st.flow = null;
      say(ok ? '<p><b>Sent.</b> Tash will be in touch on ' + esc(d.phone) + ' to confirm your time. If you’d rather book a time yourself now, Booksy is quickest.</p><div class="ag-btns">' + booksy('Open Booksy') + '</div>'
             : '<p>I couldn’t send that from here. Tap below to send the same request to Tash on WhatsApp.</p><div class="ag-btns"><a class="ag-btn solid" href="' + wa(msg) + '"' + ext + '>Send on WhatsApp</a></div>');
      chips([['Something else', 'menu']]);
    };
    fetch('/', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: body.toString() })
      .then(function (r) { done(r.ok); }).catch(function () { done(false); });
  };
  var flowAnswer = function (v) {
    var f = st.flow; if (!f) return;
    var val = v.trim(), d = f.d;
    if (val === '__cancel' || / (cancel|stop|never ?mind|quit) /.test(norm(val)) && val.length < 25) { st.flow = null; say('<p>No problem, I’ve cancelled that request.</p>'); return chips(MAIN); }
    if (val === '__restart') return startRequest(null);
    if (val === '__send') return send();
    switch (f.step) {
      case 'what':
        var it = BY[val] || findItem(norm(val));
        if (it) { d.slug = it.slug; d.treatment = it.name; return ask(it.prices.length > 1 ? 'option' : 'name'); }
        d.treatment = val; return ask('name');
      case 'option': d.option = val === 'Not sure' ? '' : val; return ask('name');
      case 'name':
        if (val.length < 2) { say('<p>Please type your name.</p>'); return; }
        d.name = val.slice(0, 80); return ask('phone');
      case 'phone':
        var digits = val.replace(/[^\d]/g, '');
        if (digits.length < 9 || digits.length > 13) { say('<p>That doesn’t look like a phone number. Please type it like 071 234 5678.</p>'); return; }
        d.phone = val.slice(0, 20); return ask('days');
      case 'days': d.days = val.slice(0, 60); return ask('time');
      case 'time': d.time = val.slice(0, 40); return ask('notes');
      case 'notes': d.notes = val === '-' ? '' : val.slice(0, 400); return ask('confirm');
      case 'confirm': say('<p>Tap <b>Send request</b> to send it, or <b>Start over</b> to change something.</p>'); return;
    }
  };

  /* ---------- Claude (when switched on) ---------- */
  var ACTION = function (a) {
    var p = a.split(':'), it = BY[p[1]];
    if (p[0] === 'book') return booksy();
    if (p[0] === 'whatsapp') return '<a class="ag-btn" href="' + wa('Hi Tash, ') + '"' + ext + '>WhatsApp Tash</a>';
    if (p[0] === 'page' && it) return '<a class="ag-btn" href="' + esc(it.url) + '">' + esc(it.name) + '</a>';
    if (p[0] === 'request') return chip('Request a time', 'request' + (it ? ':' + it.slug : ''));
    return '';
  };
  var format = function (t) {
    return t.split(/\n{2,}/).map(function (para) {
      var lines = para.split('\n');
      if (lines.every(function (l) { return /^\s*[-•]\s+/.test(l); })) return list(lines.map(function (l) { return esc(l.replace(/^\s*[-•]\s+/, '')); }));
      return '<p>' + esc(para).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\n/g, '<br>') + '</p>';
    }).join('');
  };
  var askAI = function (text) {
    st.hist.push({ role: 'user', content: text }); st.hist = st.hist.slice(-16);
    var t = add('bot ag-typing', '<span></span><span></span><span></span>'); t.setAttribute('aria-hidden', 'true');
    fetch('/.netlify/functions/agent', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: st.hist }) })
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(function (j) {
        t.remove();
        if (!j.reply) throw new Error('empty');
        st.hist.push({ role: 'assistant', content: j.reply });
        var btns = (j.actions || []).map(ACTION).join('');
        say(format(j.reply) + (btns ? '<div class="ag-btns">' + btns + '</div>' : ''));
      })
      .catch(function () { t.remove(); st.hist.pop(); answer(text); save(); });
  };

  /* ---------- wiring ---------- */
  var open = function (yes, a) {
    panel.hidden = !yes; launch.setAttribute('aria-expanded', String(yes)); document.documentElement.classList.toggle('ag-open', yes);
    if (yes) {
      if (!log.children.length) greet();
      if (a) act(a);
      scroll(); setTimeout(function () { input.focus({ preventScroll: true }); }, 30);
    } else launch.focus();
    save();
  };
  launch.addEventListener('click', function () { open(panel.hidden); });
  panel.querySelector('.ag-x').addEventListener('click', function () { open(false); });
  panel.addEventListener('keydown', function (e) { if (e.key === 'Escape') { e.stopPropagation(); open(false); } });
  document.addEventListener('click', function (e) {
    var o = e.target.closest('[data-agent-open]');
    if (o) { e.preventDefault(); open(true, o.getAttribute('data-agent-open') || ''); }
  });
  log.addEventListener('click', function (e) {
    var b = e.target.closest('.ag-chip'); if (!b) return;
    var a = b.getAttribute('data-act'), group = b.closest('.ag-msg.chips');
    you(b.textContent);
    if (group) group.remove();
    if (st.flow && a.indexOf('ans:') !== 0 && a.indexOf('request') !== 0) st.flow = null;
    typing(function () { act(a); });
    input.focus({ preventScroll: true });
  });
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var text = input.value.trim(); if (!text) return;
    input.value = '';
    [].slice.call(log.querySelectorAll('.ag-msg.chips')).forEach(function (c) { c.remove(); });
    you(text);
    if (st.flow) return typing(function () { flowAnswer(text); });
    if (K.ai && location.protocol.indexOf('http') === 0) return askAI(text);
    typing(function () { answer(text); });
  });
  if (saved && saved.open && innerWidth > 640) open(true);
  window.LBT_AGENT_OPEN = open;
})();
