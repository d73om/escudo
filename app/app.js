/* escudo · app de testes: ler talões, ver o mês, enviar ao contabilista */
(function () {
  'use strict';

  var SUPABASE_URL = 'https://wviluzhxzxlnoyiubkgg.supabase.co';
  var CHAVE = 'sb_publishable_1zpU5ThxRiaCvQeI95HBmw_uHxWhIW_';
  var APP_URL = location.origin + location.pathname;
  var sb = window.supabase.createClient(SUPABASE_URL, CHAVE, {
    auth: { flowType: 'implicit', persistSession: true, detectSessionInUrl: true, autoRefreshToken: true }
  });

  var CATS = {
    alimentacao: ['Alimentação', '#163300'],
    bebidas_alcoolicas: ['Bebidas alcoólicas', '#054d28'],
    limpeza: ['Limpeza', '#0b4c72'],
    higiene: ['Higiene e cuidado pessoal', '#9fe870'],
    bebe: ['Bebé', '#c9e7b4'],
    animais: ['Animais', '#b5651d'],
    casa: ['Casa e utilidades', '#6a6c6a'],
    eletronica: ['Eletrónica', '#0e0f0c'],
    roupa: ['Roupa e calçado', '#7a4e9e'],
    saude: ['Saúde e farmácia', '#3b82c4'],
    combustivel: ['Combustível', '#d9a400'],
    restauracao: ['Restauração', '#e07a5f'],
    sacos_embalagens: ['Sacos e embalagens', '#c8cbc6'],
    outros: ['Outros', '#a8aaa6']
  };
  var PERFIS = {
    particular: 'Só para a casa (particular)',
    independente_simplificado: 'Casa e trabalho independente (recibos verdes)',
    eni_contabilidade_organizada: 'Casa e empresa em nome individual, com contabilidade organizada',
    sociedade: 'Casa e uma empresa (sociedade)'
  };

  var estado = { user: null, perfil: null, testador: false, mes: mesAtual(), filtro: 'tudo', faturas: [], rascunho: null, imagem: null, aviso: null, pasta: null };
  var app = document.getElementById('app');
  var inputFoto = document.getElementById('foto');
  var inputGaleria = document.getElementById('galeria');

  /* ---------- utilitários ---------- */
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function eur(n) { return Number(n || 0).toLocaleString('pt-PT', { style: 'currency', currency: 'EUR' }); }
  function hoje() { var d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function mesAtual() { return hoje().slice(0, 7); }
  function nomeMes(m) { var p = m.split('-'); var n = new Date(Number(p[0]), Number(p[1]) - 1, 1).toLocaleDateString('pt-PT', { month: 'long' }); return n + ' de ' + p[0]; }
  function somarMes(m, d) { var p = m.split('-'); var dt = new Date(Number(p[0]), Number(p[1]) - 1 + d, 1); return dt.getFullYear() + '-' + String(dt.getMonth() + 1).padStart(2, '0'); }
  function dataPt(d) { if (!d) return ''; var p = d.split('-'); return p[2] + '/' + p[1] + '/' + p[0]; }
  function profissional() { return estado.perfil && estado.perfil.perfil !== 'particular'; }
  function r2(n) { return Math.round(Number(n || 0) * 100) / 100; }
  function slug(s) { return String(s || 'loja').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'loja'; }
  function csv(v) { var s = String(v == null ? '' : v); return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }
  function num(n) { return n == null ? '' : String(r2(n)).replace('.', ','); }

  function render(html, manterScroll) {
    var y = window.scrollY;
    app.innerHTML = html;
    document.body.classList.toggle('fundo-escuro', html.indexOf('ecra boas') > -1);
    window.scrollTo(0, manterScroll ? y : 0);
    var t = app.querySelector('[data-foco]'); if (t) t.focus();
  }
  function on(sel, ev, fn) { app.querySelectorAll(sel).forEach(function (el) { el.addEventListener(ev, fn); }); }

  var ICON = {
    menu: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg>',
    voltar: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 6-6 6 6 6"/></svg>',
    fechar: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>',
    camara: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>',
    esq: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 6-6 6 6 6"/></svg>',
    dir: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg>'
  };

  function ecraCarregar(texto) {
    render('<main class="ecra"><div class="carregar"><div class="rodela" aria-hidden="true"></div><p role="status">' + esc(texto) + '</p></div></main>');
  }

  /* ---------- entrada ---------- */
  function ecraBoasVindas() {
    var exemplo = [['Leite meio-gordo', '1,58 €', 'alimentacao'], ['Lixívia Neoblanc', '1,29 €', 'limpeza'], ['Pasta de dentes', '1,63 €', 'higiene']];
    render(
      '<main class="ecra boas"><header class="topo"><span class="logo">escudo.</span><span class="selo">Fase de testes</span></header>' +
      '<div class="conteudo">' +
      '<h1>O seu dinheiro, às claras.</h1>' +
      '<p class="lead">Fotografe o talão. A escudo lê cada artigo, mostra para onde vai o dinheiro e quanto fica para o Estado.</p>' +
      '<div class="demo" aria-hidden="true"><div class="demo-topo"><strong>Lidl</strong><span>4,50 €</span></div>' +
      exemplo.map(function (e) { return '<div class="demo-linha"><span>' + e[0] + '</span><span class="tag" style="background:' + CATS[e[2]][1] + ';color:' + (e[2] === 'higiene' ? 'var(--forest)' : '#fff') + '">' + CATS[e[2]][0].split(' ')[0] + '</span><b>' + e[1] + '</b></div>'; }).join('') +
      '<div class="demo-iva"><span>Para o Estado em IVA</span><b>0,64 €</b></div></div>' +
      '<ol class="passos"><li><span><b>Fotografe</b> o talão ou a fatura.</span></li><li><span><b>Confirme</b> as categorias que a app sugere.</span></li><li><span><b>Envie</b> a pasta do mês ao contabilista.</span></li></ol>' +
      '</div>' +
      '<footer class="rodape"><button class="btn btn-lima largo" id="bIrEntrar">Entrar</button>' +
      '<p class="peq">Por convite, nesta fase. <a href="../privacidade.html">Privacidade</a> · <a href="../">Sobre a escudo</a></p></footer>' +
      '</main>'
    );
    on('#bIrEntrar', 'click', function () { ecraEntrar(); });
  }

  function ecraEntrar(mensagem) {
    render(
      '<main class="ecra"><header class="topo"><button class="redondo" id="bVoltarBV" aria-label="Voltar">' + ICON.voltar + '</button><span class="logo">escudo.</span><span style="width:44px"></span></header>' +
      '<div class="conteudo">' +
      '<h1>Entrar</h1>' +
      '<p>Escreva o seu email. Enviamos um link para entrar, sem palavra-passe.</p>' +
      (mensagem ? '<p class="msg ' + (mensagem.tipo || 'ok') + '" role="status">' + mensagem.html + '</p>' : '') +
      '<form id="fEntrar" class="cinza" novalidate>' +
      '<label class="campo">O seu email<input id="email" type="email" autocomplete="email" required maxlength="254" placeholder="nome@exemplo.pt" data-foco></label>' +
      '<button class="btn btn-lima largo" type="submit" id="bEntrar">Enviar link de entrada</button>' +
      '</form>' +
      '<p class="peq">Fase de testes. Saiba como tratamos os dados no <a href="../privacidade.html">aviso de privacidade</a>.</p>' +
      '</div></main>'
    );
    on('#bVoltarBV', 'click', ecraBoasVindas);
    on('#fEntrar', 'submit', function (ev) {
      ev.preventDefault();
      var email = app.querySelector('#email').value.trim().toLowerCase();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { ecraEntrar({ tipo: 'aviso', html: 'Confirme o seu email, parece ter um erro.' }); return; }
      var b = app.querySelector('#bEntrar'); b.disabled = true; b.textContent = 'A enviar…';
      sb.auth.signInWithOtp({ email: email, options: { emailRedirectTo: APP_URL, shouldCreateUser: true } }).then(function (r) {
        if (r.error) {
          var limite = /rate|limit|seconds/i.test(r.error.message || '');
          ecraEntrar({ tipo: 'aviso', html: limite ? '<strong>Já foram enviados os links possíveis nesta hora.</strong> Nesta fase de testes o servidor de email só envia 2 por hora. Tente daqui a uma hora ou, se tiver a app aberta no computador, use lá “Continuar no telemóvel”.' : 'Não foi possível enviar o link. Tente de novo daqui a pouco.' });
          return;
        }
        ecraEntrar({ tipo: 'ok', html: '<strong>Enviámos um link para ' + esc(email) + '.</strong> Abra-o neste telemóvel. Pode demorar um minuto; veja também o spam.' });
      });
    });
  }

  /* ---------- perfil ---------- */
  function ecraPerfil(primeira) {
    var atual = estado.perfil || {};
    var opcoes = Object.keys(PERFIS).map(function (k) {
      return '<label><input type="radio" name="perfil" value="' + k + '"' + ((atual.perfil || 'particular') === k ? ' checked' : '') + '><span>' + esc(PERFIS[k]) + '</span></label>';
    }).join('');
    render(
      '<main class="ecra"><header class="topo">' +
      (primeira ? '<span class="logo">escudo.</span>' : '<button class="redondo" id="bVoltar" aria-label="Voltar">' + ICON.voltar + '</button>') +
      '</header><div class="conteudo">' +
      '<h1>' + (primeira ? 'Bem-vindo.' : 'O seu perfil') + '</h1>' +
      '<p>Para que vai usar a app? Se tiver atividade por conta própria, pode separar as despesas da atividade das da casa.</p>' +
      '<form id="fPerfil" class="conteudo" style="padding:0" novalidate>' +
      '<fieldset style="border:none;margin:0;padding:0"><legend class="sr" style="position:absolute;left:-9999px">Perfil</legend><div class="escolhas">' + opcoes + '</div></fieldset>' +
      '<label class="campo">Email do seu contabilista <span class="opt">(opcional)</span><input id="emailCont" type="email" maxlength="254" placeholder="contabilista@exemplo.pt" value="' + esc(atual.email_contabilista || '') + '"></label>' +
      '<p id="msgPerfil" class="msg aviso" hidden></p>' +
      '<button class="btn btn-lima largo" type="submit" id="bPerfil">' + (primeira ? 'Começar' : 'Guardar') + '</button>' +
      '</form></div></main>'
    );
    on('#bVoltar', 'click', ecraInicio);
    on('#fPerfil', 'submit', function (ev) {
      ev.preventDefault();
      var perfil = app.querySelector('input[name="perfil"]:checked').value;
      var ec = app.querySelector('#emailCont').value.trim().toLowerCase();
      var msg = app.querySelector('#msgPerfil');
      if (ec && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(ec)) { msg.hidden = false; msg.textContent = 'Confirme o email do contabilista.'; return; }
      var b = app.querySelector('#bPerfil'); b.disabled = true;
      sb.from('perfis').upsert({ user_id: estado.user.id, perfil: perfil, email_contabilista: ec || null }, { onConflict: 'user_id' }).select().single().then(function (r) {
        if (r.error) { b.disabled = false; msg.hidden = false; msg.textContent = 'Não foi possível guardar. Tente de novo.'; return; }
        estado.perfil = r.data; estado.filtro = 'tudo';
        ecraInicio();
      });
    });
  }

  /* ---------- início: o mês ---------- */
  function carregarMes() {
    var inicio = estado.mes + '-01';
    var fim = somarMes(estado.mes, 1) + '-01';
    return sb.from('faturas')
      .select('id, loja, data, total, iva_total, tem_nif_cliente, ambito, soma_confere, imagem_path, linhas(categoria, valor)')
      .gte('data', inicio).lt('data', fim)
      .order('data', { ascending: false }).order('criado_em', { ascending: false })
      .then(function (r) { if (r.error) throw r.error; estado.faturas = r.data || []; return estado.faturas; });
  }

  function faturasVisiveis() {
    if (!profissional() || estado.filtro === 'tudo') return estado.faturas;
    return estado.faturas.filter(function (f) { return f.ambito === estado.filtro; });
  }

  function porCategoria(linhas) {
    var soma = {};
    linhas.forEach(function (l) { soma[l.categoria] = r2((soma[l.categoria] || 0) + Number(l.valor)); });
    return Object.keys(soma).filter(function (k) { return soma[k] > 0; }).sort(function (a, b) { return soma[b] - soma[a]; }).map(function (k) { return [k, soma[k]]; });
  }

  function barraCategorias(lista) {
    var total = lista.reduce(function (s, x) { return s + x[1]; }, 0) || 1;
    var barra = lista.map(function (x) { return '<span style="width:' + (x[1] / total * 100).toFixed(2) + '%;background:' + CATS[x[0]][1] + '"></span>'; }).join('');
    var legenda = lista.map(function (x) { return '<span><i class="ponto" style="background:' + CATS[x[0]][1] + '"></i>' + esc(CATS[x[0]][0]) + '<b>' + eur(x[1]) + '</b></span>'; }).join('');
    var texto = lista.map(function (x) { return CATS[x[0]][0] + ' ' + eur(x[1]); }).join(', ');
    return '<div class="barra" role="img" aria-label="' + esc(texto) + '">' + barra + '</div><div class="legenda">' + legenda + '</div>';
  }

  function ecraInicio() {
    ecraCarregar('A carregar…');
    carregarMes().then(desenharInicio).catch(function () {
      render('<main class="ecra"><div class="carregar"><p class="msg aviso">Não foi possível carregar os seus talões. Verifique a ligação à internet.</p><button class="btn btn-contorno" id="bTentar">Tentar de novo</button></div></main>');
      on('#bTentar', 'click', ecraInicio);
    });
  }

  function desenharInicio() {
    var fs = faturasVisiveis();
    var total = r2(fs.reduce(function (s, f) { return s + Number(f.total); }, 0));
    var iva = r2(fs.reduce(function (s, f) { return s + Number(f.iva_total || 0); }, 0));
    var comNif = fs.filter(function (f) { return f.tem_nif_cliente; }).length;
    var linhas = []; fs.forEach(function (f) { linhas = linhas.concat(f.linhas || []); });
    var cats = porCategoria(linhas);
    var eHoje = estado.mes === mesAtual();

    var filtro = profissional() ? '<div class="segmento" role="group" aria-label="Mostrar">' +
      ['tudo', 'pessoal', 'atividade'].map(function (k) { return '<button type="button" data-filtro="' + k + '" aria-pressed="' + (estado.filtro === k) + '">' + { tudo: 'Tudo', pessoal: 'Pessoal', atividade: 'Atividade' }[k] + '</button>'; }).join('') + '</div>' : '';

    var lista = fs.length ? '<div class="lista">' + fs.map(function (f) {
      var tags = [];
      tags.push(f.tem_nif_cliente ? '<span class="tag verde">Com NIF</span>' : '<span class="tag">Sem NIF</span>');
      if (profissional()) tags.push('<span class="tag' + (f.ambito === 'atividade' ? ' verde' : '') + '">' + (f.ambito === 'atividade' ? 'Atividade' : 'Pessoal') + '</span>');
      if (f.soma_confere === false) tags.push('<span class="tag vermelho">Confirmar</span>');
      return '<button class="item" data-fatura="' + f.id + '"><span class="info"><span class="nome">' + esc(f.loja || 'Talão') + '</span><span class="peq">' + dataPt(f.data) + '</span></span>' +
        '<span style="display:flex;flex-direction:column;align-items:flex-end;gap:4px"><span class="valor">' + eur(f.total) + '</span><span class="tags">' + tags.join('') + '</span></span></button>';
    }).join('') + '</div>' : '<div class="vazio"><strong style="color:var(--obsidian)">Ainda não há talões em ' + esc(nomeMes(estado.mes)) + '.</strong><span class="peq">Fotografe o primeiro com o botão verde.</span></div>';

    render(
      '<main class="ecra"><header class="topo"><span class="logo">escudo.</span>' +
      '<button class="redondo" id="bMenu" aria-label="Menu" aria-expanded="false">' + ICON.menu + '</button></header>' +
      '<nav class="menu" id="menu" hidden aria-label="Menu"><button id="mPerfil">O meu perfil</button>' + (toque() ? '' : '<button id="mTelemovel">Continuar no telemóvel</button>') + '<a href="../sugestoes.html?pagina=app">Enviar sugestões</a><button id="mSair">Sair</button></nav>' +
      '<div class="conteudo">' +
      (estado.aviso ? '<p class="msg ' + estado.aviso.tipo + '" role="status">' + esc(estado.aviso.texto) + '</p>' : '') +
      (!toque() ? '<div class="cinza"><strong style="color:var(--obsidian)">Está no computador.</strong><span>Para fotografar talões, passe a sessão para o telemóvel com um código QR.</span><button class="btn btn-lima" id="bTelemovel">Continuar no telemóvel</button></div>' : '') +
      (!estado.testador ? '<p class="msg aviso">A leitura de talões está reservada aos testadores. Peça acesso ao Diogo.</p>' : '') +
      '<div class="mes"><button class="redondo" id="bAnt" aria-label="Mês anterior">' + ICON.esq + '</button><strong>' + esc(nomeMes(estado.mes).replace(/^./, function (c) { return c.toUpperCase(); })) + '</strong>' +
      '<button class="redondo" id="bSeg" aria-label="Mês seguinte"' + (eHoje ? ' disabled style="opacity:.35"' : '') + '>' + ICON.dir + '</button></div>' +
      filtro +
      '<section class="escuro" aria-label="Resumo do mês">' +
      '<span style="font-size:14px;font-weight:500">Gasto em talões</span><span class="grande">' + eur(total) + '</span>' +
      '<div class="linha"><span>Para o Estado em IVA</span><strong style="color:var(--paper)">' + eur(iva) + '</strong></div>' +
      '<div class="linha"><span>' + fs.length + (fs.length === 1 ? ' talão' : ' talões') + '</span><span>' + comNif + ' com o seu NIF</span></div>' +
      '</section>' +
      (cats.length ? '<section aria-label="Por tipo"><h2 style="margin-bottom:10px">O que comprou</h2>' + barraCategorias(cats) + '</section>' : '') +
      '<section aria-label="Talões"><h2 style="margin-bottom:4px">Talões</h2>' + lista + '</section>' +
      '</div>' +
      '<footer class="rodape"><button class="btn btn-lima largo" id="bFoto">' + ICON.camara + 'Fotografar talão</button>' +
      '<div class="duplo"><button class="btn btn-contorno" id="bGaleria">Da galeria</button><button class="btn btn-contorno" id="bPasta">Enviar ao contabilista</button></div></footer>' +
      '</main>'
    );
    estado.aviso = null;
    on('#bMenu', 'click', function () { var m = app.querySelector('#menu'); m.hidden = !m.hidden; this.setAttribute('aria-expanded', String(!m.hidden)); });
    on('#mPerfil', 'click', function () { ecraPerfil(false); });
    on('#mTelemovel, #bTelemovel', 'click', ecraTelemovel);
    on('#mSair', 'click', function () { sb.auth.signOut().then(function () { estado.user = null; ecraBoasVindas(); }); });
    on('#bAnt', 'click', function () { estado.mes = somarMes(estado.mes, -1); ecraInicio(); });
    on('#bSeg', 'click', function () { if (!eHoje) { estado.mes = somarMes(estado.mes, 1); ecraInicio(); } });
    on('[data-filtro]', 'click', function () { estado.filtro = this.getAttribute('data-filtro'); desenharInicio(); });
    on('[data-fatura]', 'click', function () { ecraFatura(this.getAttribute('data-fatura')); });
    on('#bFoto', 'click', function () { inputFoto.value = ''; inputFoto.click(); });
    on('#bGaleria', 'click', function () { inputGaleria.value = ''; inputGaleria.click(); });
    on('#bPasta', 'click', prepararPasta);
  }

  /* ---------- fotografia → leitura ---------- */
  function carregarImagem(file) {
    return new Promise(function (ok, falha) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () { ok(img); };
      img.onerror = function () { URL.revokeObjectURL(url); falha(new Error('imagem')); };
      img.src = url;
    });
  }

  function jpeg(canvas, q) {
    return new Promise(function (ok) { canvas.toBlob(function (b) { ok(b); }, 'image/jpeg', q); });
  }

  function base64(blob) {
    return new Promise(function (ok) {
      var r = new FileReader();
      r.onload = function () { ok(String(r.result).split(',')[1]); };
      r.readAsDataURL(blob);
    });
  }

  function prepararImagens(img) {
    var w = img.naturalWidth, h = img.naturalHeight;
    // Arquivo: lado maior até 2400 px
    var s1 = Math.min(1, 2400 / Math.max(w, h));
    var a = document.createElement('canvas'); a.width = Math.round(w * s1); a.height = Math.round(h * s1);
    a.getContext('2d').drawImage(img, 0, 0, a.width, a.height);
    // Leitura: largura até 1100 px, em partes de até 1600 px de altura
    var W = Math.min(w, 1100), s2 = W / w, H = Math.round(h * s2);
    var sobre = 120, alt = 1600, n = 1;
    if (H > alt * 1.15) {
      n = Math.ceil((H - sobre) / (alt - sobre));
      if (n > 6) { n = 6; alt = Math.ceil((H + 5 * sobre) / 6); }
    } else { alt = H; }
    var partes = [];
    for (var i = 0; i < n; i++) {
      var y = Math.max(0, Math.min(i * (alt - sobre), H - alt));
      var c = document.createElement('canvas'); c.width = W; c.height = Math.min(alt, H);
      c.getContext('2d').drawImage(img, 0, y / s2, w, c.height / s2, 0, 0, W, c.height);
      partes.push(c);
    }
    return Promise.all([jpeg(a, 0.82)].concat(partes.map(function (c) { return jpeg(c, 0.85).then(base64); })))
      .then(function (r) { return { arquivo: r[0], partes: r.slice(1) }; });
  }

  function lerTalao(file) {
    if (!file) return;
    if (!estado.testador) { estado.aviso = { tipo: 'aviso', texto: 'A leitura de talões está reservada aos testadores. Peça acesso ao Diogo.' }; ecraInicio(); return; }
    ecraCarregar('A preparar a imagem…');
    var arquivo;
    carregarImagem(file).then(prepararImagens).then(function (r) {
      arquivo = r.arquivo;
      ecraCarregar('A ler o talão… pode demorar até 30 segundos.');
      return sb.auth.getSession().then(function (s) {
        return fetch(SUPABASE_URL + '/functions/v1/ler-talao', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + s.data.session.access_token, apikey: CHAVE },
          body: JSON.stringify({ imagens: r.partes.map(function (d) { return { data: d }; }) })
        });
      });
    }).then(function (resp) {
      return resp.json().catch(function () { return {}; }).then(function (j) { return { estado: resp.status, j: j }; });
    }).then(function (res) {
      if (res.estado === 200 && res.j.ok) {
        var t = res.j.talao;
        estado.rascunho = {
          loja: t.loja, nif_loja: t.nif_loja, data: t.data || hoje(), tipo_documento: t.tipo_documento,
          tem_nif_cliente: t.tem_nif_cliente, total: t.total, iva: t.iva, iva_total: t.iva_total,
          linhas: t.linhas, avisos: t.avisos || [], soma: res.j.soma, soma_confere: res.j.soma_confere, ambito: 'pessoal'
        };
        estado.imagem = arquivo;
        ecraRever();
        return;
      }
      var textos = {
        403: 'A leitura de talões está reservada aos testadores. Peça acesso ao Diogo.',
        429: 'Chegou ao limite de leituras de hoje. Amanhã há mais.',
        413: 'A fotografia é demasiado grande. Tente outra vez.',
        401: 'A sua sessão terminou. Entre de novo.'
      };
      estado.aviso = { tipo: 'aviso', texto: textos[res.estado] || 'Não consegui ler este talão. Tente outra fotografia: com boa luz, direita e com o talão inteiro.' };
      if (res.estado === 401) { ecraEntrar({ tipo: 'aviso', html: estado.aviso.texto }); estado.aviso = null; return; }
      ecraInicio();
    }).catch(function () {
      estado.aviso = { tipo: 'aviso', texto: 'Não consegui preparar ou enviar a imagem. Verifique a ligação e tente de novo.' };
      ecraInicio();
    });
  }
  inputFoto.addEventListener('change', function () { lerTalao(inputFoto.files[0]); });
  inputGaleria.addEventListener('change', function () { lerTalao(inputGaleria.files[0]); });

  /* ---------- ver um talão (rascunho ou guardado) ---------- */
  function htmlTalao(t, editavel) {
    var cats = porCategoria(t.linhas || []);
    var nif = t.tem_nif_cliente
      ? '<p class="msg ok">Fatura com o seu NIF: entra no e-Fatura em seu nome.</p>'
      : '<p class="msg aviso" style="background:var(--fog);color:var(--charcoal)">Sem o seu NIF: esta compra não entra no e-Fatura em seu nome. Da próxima vez, peça fatura com NIF.</p>';
    var soma = t.soma_confere === false
      ? '<p class="msg aviso">A soma dos artigos não bate com o total do talão. Confirme os valores e as categorias.</p>' : '';
    var avisos = (t.avisos || []).map(function (a) { return '<p class="msg aviso">' + esc(a) + '</p>'; }).join('');
    var ivas = (t.iva || []).map(function (x) { return '<div class="linha"><span>IVA ' + num(x.taxa) + '%</span><span>' + eur(x.valor) + '</span></div>'; }).join('');
    var ambito = profissional() ? '<div class="segmento" role="group" aria-label="Esta despesa é">' +
      ['pessoal', 'atividade'].map(function (k) { return '<button type="button" data-ambito="' + k + '" aria-pressed="' + (t.ambito === k) + '">' + (k === 'pessoal' ? 'Pessoal' : 'Da atividade') + '</button>'; }).join('') + '</div>' : '';
    var opcoes = function (sel) { return Object.keys(CATS).map(function (k) { return '<option value="' + k + '"' + (k === sel ? ' selected' : '') + '>' + esc(CATS[k][0]) + '</option>'; }).join(''); };
    var artigos = (t.linhas || []).map(function (l, i) {
      return '<div class="artigo' + (l.confianca === 'baixa' ? ' duvida' : '') + '"><div class="cima"><strong>' + esc(l.descricao) + '</strong><span>' + eur(l.valor) + '</span></div>' +
        (l.descricao_original && l.descricao_original !== l.descricao ? '<span class="peq">' + esc(l.descricao_original) + (l.taxa_iva != null ? ' · IVA ' + num(l.taxa_iva) + '%' : '') + '</span>' : (l.taxa_iva != null ? '<span class="peq">IVA ' + num(l.taxa_iva) + '%</span>' : '')) +
        (l.confianca === 'baixa' ? '<span class="peq" style="color:var(--red)">Não tenho a certeza: confirme a categoria.</span>' : '') +
        '<label class="peq" style="position:absolute;left:-9999px" for="cat' + i + '">Categoria de ' + esc(l.descricao) + '</label><select id="cat' + i + '" data-linha="' + i + '">' + opcoes(l.categoria) + '</select></div>';
    }).join('');
    var cabecalho = editavel
      ? '<label class="campo">Loja<input id="loja" maxlength="200" value="' + esc(t.loja) + '"></label><label class="campo">Data<input id="data" type="date" value="' + esc(t.data || '') + '"></label>'
      : '<div><h1 style="font-size:32px">' + esc(t.loja || 'Talão') + '</h1><p class="peq" style="margin-top:6px">' + dataPt(t.data) + (t.tipo_documento ? ' · ' + esc(t.tipo_documento) : '') + '</p></div>';
    return cabecalho +
      '<div><span class="peq">Total</span><div style="font-size:44px;line-height:1;font-weight:900;letter-spacing:-.04em;color:var(--obsidian)">' + eur(t.total) + '</div></div>' +
      nif + soma + avisos + ambito +
      '<section class="escuro" aria-label="IVA"><div class="linha" style="align-items:baseline"><span style="color:var(--paper);font-weight:500">Para o Estado em IVA</span><span class="grande" style="font-size:28px">' + eur(t.iva_total) + '</span></div>' + ivas +
      '<div class="linha"><span>Valor sem IVA</span><span>' + eur(r2(t.total - (t.iva_total || 0))) + '</span></div></section>' +
      (cats.length ? '<section aria-label="Por tipo"><h2 style="margin-bottom:10px">O que comprou</h2>' + barraCategorias(cats) + '</section>' : '') +
      '<section aria-label="Artigos"><h2>Artigos</h2>' + (artigos || '<p class="peq">Sem artigos lidos.</p>') + '</section>';
  }

  function ecraRever(manterScroll) {
    var t = estado.rascunho;
    render(
      '<main class="ecra"><header class="topo"><button class="redondo" id="bDescartar" aria-label="Descartar">' + ICON.fechar + '</button><strong style="color:var(--obsidian)">Confirme o talão</strong><span style="width:44px"></span></header>' +
      '<div class="conteudo">' + htmlTalao(t, true) + '<p id="msgGuardar" class="msg aviso" hidden></p></div>' +
      '<footer class="rodape"><button class="btn btn-lima largo" id="bGuardar">Guardar</button></footer></main>', manterScroll
    );
    on('#bDescartar', 'click', function () { estado.rascunho = null; estado.imagem = null; ecraInicio(); });
    on('#loja', 'input', function () { t.loja = this.value; });
    on('#data', 'change', function () { t.data = this.value || hoje(); });
    on('[data-linha]', 'change', function () { t.linhas[Number(this.getAttribute('data-linha'))].categoria = this.value; t.linhas[Number(this.getAttribute('data-linha'))].confianca = 'alta'; ecraRever(true); });
    on('[data-ambito]', 'click', function () { t.ambito = this.getAttribute('data-ambito'); ecraRever(true); });
    on('#bGuardar', 'click', guardar);
  }

  function guardar() {
    var t = estado.rascunho;
    var b = app.querySelector('#bGuardar'); b.disabled = true; b.textContent = 'A guardar…';
    var id = (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()));
    var caminho = estado.user.id + '/' + id + '.jpg';
    var falhar = function () {
      sb.storage.from('faturas').remove([caminho]);
      b.disabled = false; b.textContent = 'Guardar';
      var m = app.querySelector('#msgGuardar'); m.hidden = false; m.textContent = 'Não foi possível guardar. Verifique a ligação e tente de novo.';
    };
    sb.storage.from('faturas').upload(caminho, estado.imagem, { contentType: 'image/jpeg', upsert: false }).then(function (r) {
      if (r.error) throw r.error;
      return sb.from('faturas').insert({
        id: id, loja: (t.loja || '').slice(0, 200), nif_loja: t.nif_loja, data: t.data || hoje(), tipo_documento: t.tipo_documento,
        tem_nif_cliente: t.tem_nif_cliente, total: t.total, iva_total: t.iva_total, iva: t.iva, ambito: t.ambito,
        imagem_path: caminho, soma_confere: t.soma_confere
      });
    }).then(function (r) {
      if (r.error) throw r.error;
      if (!t.linhas.length) return { error: null };
      return sb.from('linhas').insert(t.linhas.map(function (l, i) {
        return { fatura_id: id, ordem: i, descricao: l.descricao, quantidade: l.quantidade, valor: l.valor, taxa_iva: l.taxa_iva, categoria: l.categoria };
      }));
    }).then(function (r) {
      if (r.error) { sb.from('faturas').delete().eq('id', id); throw r.error; }
      estado.mes = (t.data || hoje()).slice(0, 7);
      estado.rascunho = null; estado.imagem = null;
      estado.aviso = { tipo: 'ok', texto: 'Talão guardado.' };
      ecraInicio();
    }).catch(falhar);
  }

  function ecraFatura(id) {
    ecraCarregar('A abrir o talão…');
    sb.from('faturas').select('*, linhas(*)').eq('id', id).single().then(function (r) {
      if (r.error) throw r.error;
      var f = r.data;
      f.linhas = (f.linhas || []).sort(function (a, b) { return a.ordem - b.ordem; });
      desenharFatura(f);
    }).catch(function () { estado.aviso = { tipo: 'aviso', texto: 'Não foi possível abrir o talão.' }; ecraInicio(); });
  }

  function desenharFatura(f, manterScroll) {
    render(
      '<main class="ecra"><header class="topo"><button class="redondo" id="bVoltar" aria-label="Voltar">' + ICON.voltar + '</button></header>' +
      '<div class="conteudo">' + htmlTalao(f, false) +
      '<button class="btn btn-contorno" id="bFotoVer">Ver a fotografia</button><img id="imgTalao" class="foto" alt="Fotografia do talão" hidden>' +
      '<p id="msgFatura" class="msg aviso" hidden></p>' +
      '<button class="btn-texto" id="bApagar" style="color:var(--red);align-self:flex-start">Apagar este talão</button>' +
      '<button class="btn" id="bApagarSim" style="background:var(--red);color:#fff" hidden>Sim, apagar de vez</button>' +
      '</div></main>', manterScroll
    );
    var erro = function (texto) { var m = app.querySelector('#msgFatura'); m.hidden = false; m.textContent = texto; };
    on('#bVoltar', 'click', ecraInicio);
    on('[data-linha]', 'change', function () {
      var l = f.linhas[Number(this.getAttribute('data-linha'))]; var nova = this.value;
      sb.from('linhas').update({ categoria: nova }).eq('id', l.id).then(function (r) {
        if (r.error) { erro('Não foi possível mudar a categoria.'); return; }
        l.categoria = nova; desenharFatura(f, true);
      });
    });
    on('[data-ambito]', 'click', function () {
      var novo = this.getAttribute('data-ambito');
      sb.from('faturas').update({ ambito: novo }).eq('id', f.id).then(function (r) {
        if (r.error) { erro('Não foi possível mudar.'); return; }
        f.ambito = novo; desenharFatura(f, true);
      });
    });
    on('#bFotoVer', 'click', function () {
      var img = app.querySelector('#imgTalao'); var b = this;
      if (!f.imagem_path) { erro('Este talão não tem fotografia.'); return; }
      b.disabled = true;
      sb.storage.from('faturas').createSignedUrl(f.imagem_path, 600).then(function (r) {
        b.hidden = true;
        if (r.error) { erro('Não foi possível abrir a fotografia.'); return; }
        img.src = r.data.signedUrl; img.hidden = false;
      });
    });
    on('#bApagar', 'click', function () { this.hidden = true; app.querySelector('#bApagarSim').hidden = false; });
    on('#bApagarSim', 'click', function () {
      this.disabled = true;
      var p = f.imagem_path ? sb.storage.from('faturas').remove([f.imagem_path]) : Promise.resolve();
      p.then(function () { return sb.from('faturas').delete().eq('id', f.id); }).then(function (r) {
        if (r && r.error) { erro('Não foi possível apagar.'); return; }
        estado.aviso = { tipo: 'ok', texto: 'Talão apagado.' }; ecraInicio();
      });
    });
  }

  /* ---------- pasta do mês → contabilista ---------- */
  function prepararPasta() {
    var fs = faturasVisiveis();
    if (!fs.length) { estado.aviso = { tipo: 'aviso', texto: 'Não há talões em ' + nomeMes(estado.mes) + ' para enviar.' }; desenharInicio(); return; }
    ecraCarregar('A preparar a pasta de ' + nomeMes(estado.mes) + '…');
    var ids = fs.map(function (f) { return f.id; });
    sb.from('faturas').select('*, linhas(*)').in('id', ids).order('data').then(function (r) {
      if (r.error) throw r.error;
      var lista = r.data;
      var zip = new JSZip();
      var res = ['Data;Loja;NIF da loja;Documento;Com o meu NIF;Âmbito;Total (€);IVA (€);Fotografia'];
      var art = ['Data;Loja;Artigo;Categoria;Taxa de IVA (%);Valor (€);Âmbito'];
      var fotos = [];
      lista.forEach(function (f) {
        var nome = (f.data || 'sem-data') + '_' + slug(f.loja) + '_' + f.id.slice(0, 6) + '.jpg';
        res.push([f.data, f.loja, f.nif_loja, f.tipo_documento, f.tem_nif_cliente ? 'Sim' : 'Não', f.ambito === 'atividade' ? 'Atividade' : 'Pessoal', num(f.total), num(f.iva_total), f.imagem_path ? 'fotografias/' + nome : ''].map(csv).join(';'));
        (f.linhas || []).sort(function (a, b) { return a.ordem - b.ordem; }).forEach(function (l) {
          art.push([f.data, f.loja, l.descricao, CATS[l.categoria] ? CATS[l.categoria][0] : l.categoria, num(l.taxa_iva), num(l.valor), f.ambito === 'atividade' ? 'Atividade' : 'Pessoal'].map(csv).join(';'));
        });
        if (f.imagem_path) fotos.push(sb.storage.from('faturas').download(f.imagem_path).then(function (d) { if (!d.error) zip.file('fotografias/' + nome, d.data); }));
      });
      zip.file('resumo.csv', '﻿' + res.join('\r\n'));
      zip.file('artigos.csv', '﻿' + art.join('\r\n'));
      return Promise.all(fotos).then(function () { return zip.generateAsync({ type: 'blob' }); }).then(function (blob) {
        var sufixo = profissional() && estado.filtro !== 'tudo' ? '-' + estado.filtro : '';
        var nomeZip = 'faturas-' + estado.mes + sufixo + '.zip';
        estado.pasta = { ficheiro: new File([blob], nomeZip, { type: 'application/zip' }), n: lista.length, nome: nomeZip };
        ecraPasta();
      });
    }).catch(function () { estado.aviso = { tipo: 'aviso', texto: 'Não foi possível preparar a pasta. Tente de novo.' }; ecraInicio(); });
  }

  function ecraPasta() {
    var p = estado.pasta;
    var podePartilhar = !!(navigator.canShare && navigator.canShare({ files: [p.ficheiro] }));
    var ec = estado.perfil && estado.perfil.email_contabilista;
    render(
      '<main class="ecra"><header class="topo"><button class="redondo" id="bVoltar" aria-label="Voltar">' + ICON.voltar + '</button></header>' +
      '<div class="conteudo"><h1>A pasta de ' + esc(nomeMes(estado.mes)) + ' está pronta.</h1>' +
      '<p>' + p.n + (p.n === 1 ? ' talão' : ' talões') + ', com as fotografias, um resumo e a lista de artigos em Excel (CSV).</p>' +
      (ec ? '<p class="cinza">O seu contabilista: <strong style="color:var(--obsidian)">' + esc(ec) + '</strong>. Escolha o email ou o WhatsApp ao partilhar.</p>' : '<p class="peq">Pode guardar o email do seu contabilista no perfil.</p>') +
      '</div><footer class="rodape">' +
      (podePartilhar ? '<button class="btn btn-lima largo" id="bPartilhar">Partilhar com o contabilista</button>' : '') +
      '<button class="btn ' + (podePartilhar ? 'btn-contorno' : 'btn-lima') + ' largo" id="bDescarregar">Descarregar a pasta</button></footer></main>'
    );
    on('#bVoltar', 'click', ecraInicio);
    on('#bPartilhar', 'click', function () {
      navigator.share({ files: [p.ficheiro], title: 'Faturas de ' + nomeMes(estado.mes), text: 'Faturas de ' + nomeMes(estado.mes) + ', enviadas pela app escudo.' }).catch(function () {});
    });
    on('#bDescarregar', 'click', function () {
      var a = document.createElement('a'); a.href = URL.createObjectURL(p.ficheiro); a.download = p.nome;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 5000);
    });
  }

  /* ---------- passar a sessão para o telemóvel ---------- */
  var CHAVE_SESSAO = 'sb-wviluzhxzxlnoyiubkgg-auth-token';
  function toque() { return window.matchMedia && window.matchMedia('(pointer: coarse)').matches; }

  function ecraTelemovel() {
    sb.auth.getSession().then(function (r) {
      var s = r.data && r.data.session;
      if (!s) { ecraBoasVindas(); return; }
      var guardada = { access_token: s.access_token, refresh_token: s.refresh_token };
      // O computador larga a sessão já, para não gastar o código antes do telemóvel
      sb.auth.stopAutoRefresh();
      try { localStorage.removeItem(CHAVE_SESSAO); } catch (e) {}
      var q = qrcode(0, 'M');
      q.addData(APP_URL + '#passar=' + encodeURIComponent(s.refresh_token));
      q.make();
      render(
        '<main class="ecra"><header class="topo"><span class="logo">escudo.</span></header><div class="conteudo">' +
        '<h1>Continuar no telemóvel</h1>' +
        '<ol style="margin:0;padding-left:20px;line-height:1.6"><li>Abra a câmara do telemóvel e aponte para este código.</li><li>Toque no link que aparece. A app abre já com a sua conta.</li><li>No telemóvel, use o botão “Partilhar” do navegador e “Adicionar ao ecrã principal”, para a ter à mão.</li></ol>' +
        '<div style="background:#fff;border:1px solid var(--fog);border-radius:10px;padding:16px;max-width:320px;width:100%;align-self:center">' + q.createSvgTag({ cellSize: 6, margin: 2, scalable: true }) + '</div>' +
        '<p class="peq">O código só funciona uma vez. Não o partilhe: quem o ler entra na sua conta. Depois de o usar, este computador sai da app.</p>' +
        '<button class="btn btn-lima largo" id="bFeito">Já está no telemóvel</button>' +
        '<button class="btn-texto" id="bCancelar" style="align-self:center">Cancelar e ficar no computador</button>' +
        '</div></main>'
      );
      on('#bFeito', 'click', function () {
        estado.user = null;
        ecraEntrar({ tipo: 'ok', html: 'Sessão passada para o telemóvel. Para voltar a usar o computador, peça um novo link.' });
      });
      on('#bCancelar', 'click', function () {
        sb.auth.setSession(guardada).then(function (r2) {
          sb.auth.startAutoRefresh();
          if (r2.error) { estado.user = null; ecraEntrar({ tipo: 'aviso', html: 'O código já foi usado. Para usar o computador, peça um novo link.' }); return; }
          ecraInicio();
        });
      });
    });
  }

  /* ---------- arranque ---------- */
  function arrancar(session) {
    estado.user = session.user;
    if (location.hash) history.replaceState(null, '', APP_URL);
    ecraCarregar('A entrar…');
    Promise.all([
      sb.from('perfis').select('*').maybeSingle(),
      sb.rpc('sou_testador')
    ]).then(function (r) {
      estado.perfil = r[0].data || null;
      estado.testador = Boolean(r[1].data);
      if (!estado.perfil) ecraPerfil(true); else ecraInicio();
    }).catch(function () { ecraEntrar({ tipo: 'aviso', html: 'Não foi possível entrar. Tente de novo.' }); });
  }

  var erroLink = /error_description=([^&]+)/.exec(location.hash);
  sb.auth.onAuthStateChange(function (evento, sessao) {
    if (evento === 'SIGNED_IN' && sessao && !estado.user) arrancar(sessao);
    if (evento === 'SIGNED_OUT') { estado.user = null; }
  });
  var passar = /[#&]passar=([^&]+)/.exec(location.hash);
  var inicio = passar
    ? (history.replaceState(null, '', APP_URL), ecraCarregar('A entrar…'), sb.auth.refreshSession({ refresh_token: decodeURIComponent(passar[1]) }).then(function (r) {
        if (r.error || !r.data.session) return { data: { session: null }, falhou: true };
        return { data: { session: r.data.session } };
      }))
    : sb.auth.getSession();
  inicio.then(function (r) {
    var s = r.data && r.data.session;
    if (r.falhou) { ecraEntrar({ tipo: 'aviso', html: 'Este código já foi usado ou expirou. No computador, gere um novo em “Continuar no telemóvel”.' }); return; }
    if (s) { if (!estado.user) arrancar(s); return; }
    if (erroLink) {
      history.replaceState(null, '', APP_URL);
      ecraEntrar({ tipo: 'aviso', html: 'O link de entrada expirou ou já foi usado. Peça um novo.' });
      return;
    }
    ecraBoasVindas();
  });
})();
