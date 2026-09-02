import { createClient } from '@supabase/supabase-js';
import unsaacShieldUrl from './assets/unsaac-escudo.png';
import unsaacMonumentUrl from './assets/unsaac-monumento-tricentenario.webp';
import unsaacCampusUrl from './assets/unsaac-ciudad-universitaria.webp';

// Recursos institucionales locales: Vite transforma estas rutas al generar la aplicación.
document.documentElement.style.setProperty('--sigma-shield-image', `url("${unsaacShieldUrl}")`);
document.documentElement.style.setProperty('--sigma-login-image', `url("${unsaacMonumentUrl}")`);
document.documentElement.style.setProperty('--sigma-panels-image', `url("${unsaacCampusUrl}")`);

// Cliente público: Supabase RLS limita cada operación según la sesión activa.
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

// Estado local mínimo. Las convocatorias publicadas se leen de Supabase;
// no se incluyen registros ficticios para evitar mezclarlos con datos reales.
const INITIAL = {
  calls: [],
  applications: [],
  nominations: [],
};
const LOCAL_STATE_KEY = 'sigma-data';
const LOCAL_STATE_VERSION_KEY = 'sigma-data-version';
const LOCAL_STATE_VERSION = '2';
// Los cuatro roles operativos aprobados para SIGMA.
const ROLE_LABELS = {
  ADMIN_OCRI: 'Administrador OCRI',
  ESTUDIANTE_UNSAAC: 'Alumno UNSAAC',
  GESTOR_EXTERNO: 'Gestor externo',
  ESTUDIANTE_EXTERNO: 'Estudiante externo',
};
const ROLE_VIEWS = {
  ADMIN_OCRI: 'admin',
  ESTUDIANTE_UNSAAC: 'student',
  GESTOR_EXTERNO: 'external_manager',
  ESTUDIANTE_EXTERNO: 'external',
};
let state = load();
let session = null;
let route = 'dashboard';
let passwordRecoveryMode = false;
let accessProfiles = [];
let callDraft = null;
let callWizardStep = 1;
let editingCallId = null;
let pendingProfilePhotoPreview = '';
let applicationDraft = null;
let applicationWizardStep = 1;
const pendingApplicationFiles = new Map();

// Permite usar plantillas HTML formateadas sin alterar sus interpolaciones.
const html = (strings, ...values) => String.raw({ raw: strings }, ...values);

// -----------------------------------------------------------------------------
// Estado local y utilidades de presentación
// -----------------------------------------------------------------------------
function load() {
  try {
    // La versión 2 inicia sin el catálogo de prueba que usaba el prototipo.
    // Este único cambio invalida de forma controlada el estado almacenado antes
    // de la limpieza; las sesiones de Supabase no se eliminan aquí.
    if (localStorage.getItem(LOCAL_STATE_VERSION_KEY) !== LOCAL_STATE_VERSION) {
      localStorage.setItem(LOCAL_STATE_VERSION_KEY, LOCAL_STATE_VERSION);
      localStorage.removeItem(LOCAL_STATE_KEY);
      return structuredClone(INITIAL);
    }

    const stored = JSON.parse(localStorage.getItem(LOCAL_STATE_KEY)) || {};
    return {
      ...structuredClone(INITIAL),
      // Solo las nominaciones continúan como prototipo local. Convocatorias y
      // postulaciones siempre se reconstruyen desde Supabase al iniciar sesión.
      nominations: Array.isArray(stored.nominations) ? stored.nominations : [],
    };
  } catch {
    return structuredClone(INITIAL);
  }
}
function save() {
  localStorage.setItem(LOCAL_STATE_KEY, JSON.stringify({ nominations: state.nominations }));
}
const $ = (s) => document.querySelector(s);
const esc = (s) =>
  String(s ?? '').replace(
    /[&<>'"]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[c],
  );
const shortDate = (value) => {
  const [year, month, day] = String(value || '').split('-');
  return year && month && day ? `${day}/${month}/${year.slice(-2)}` : 'Por definir';
};

const isUuid = (value) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value || '');

// Convierte la forma relacional de PostgreSQL en la forma que consumen las vistas.
async function mapDatabaseCall(call) {
  const [cover, resources] = await Promise.all([
    call.cover_image_path
      ? supabase.storage.from('call-assets').createSignedUrl(call.cover_image_path, 60 * 60)
      : null,
    Promise.all(
      (call.call_resources || []).map(async (resource) => {
        const signed = resource.storage_path
          ? await supabase.storage
              .from('call-assets')
              .createSignedUrl(resource.storage_path, 60 * 60)
          : null;
        return {
          description: resource.description || '',
          fileName: resource.file_name || 'Material OCRI',
          storagePath: resource.storage_path || '',
          downloadUrl: signed?.data?.signedUrl || '',
        };
      }),
    ),
  ]);
  return {
    id: call.id,
    code: call.code,
    title: call.title,
    direction: call.direction,
    period: call.period,
    end: call.closes_on,
    status: call.status,
    coverImagePath: call.cover_image_path || '',
    coverImage: cover?.data?.signedUrl || '',
    coverName: call.cover_image_path?.split('/').at(-1) || '',
    guidelines: (call.call_guidelines || []).map((item) => item.content),
    documents: (call.call_requirements || []).map((item) => ({
      requirementId: item.id,
      title: item.title,
      description: item.description || '',
      required: item.is_required,
    })),
    resources,
    notice: {
      links: (call.call_notices?.[0]?.call_notice_links || []).map((item) => ({
        label: item.label,
        url: item.url || '',
      })),
    },
  };
}

async function loadCallsFromDatabase() {
  if (!supabase || !session) return;
  const { data, error } = await supabase
    .from('calls')
    .select(
      'id,code,title,direction,period,closes_on,status,cover_image_path,call_guidelines(content,display_order),call_requirements(id,title,description,is_required,display_order),call_resources(description,file_name,storage_path,display_order),call_notices(call_notice_links(label,url,display_order))',
    )
    .order('created_at', { ascending: false });

  if (error) {
    console.warn('No se pudieron cargar las convocatorias desde Supabase.', error.message);
    state.calls = [];
    return;
  }

  state.calls = await Promise.all(data.map(mapDatabaseCall));
}

async function loadApplicationsFromDatabase() {
  if (!supabase || !session) return;
  const { data, error } = await supabase
    .from('applications')
    .select(
      'id,call_id,applicant_id,status,student_code,faculty,academic_program,motivation,current_step,submitted_at,created_at,calls(title,direction,period),profiles!applications_applicant_id_fkey(full_name,email),application_documents(id,requirement_id,requirement_title,is_required,storage_path,file_name,status,reviewer_comment)',
    )
    .order('updated_at', { ascending: false });

  if (error) {
    console.warn('No se pudieron cargar las postulaciones desde Supabase.', error.message);
    state.applications = [];
    return;
  }

  state.applications = data.map((application) => {
    const documents = application.application_documents || [];
    const completedDocuments = documents.filter((document) => document.storage_path).length;
    const completedFields = [
      application.student_code,
      application.faculty,
      application.academic_program,
      application.motivation,
    ].filter(Boolean).length;
    const totalParts = 4 + documents.length;
    const progress = Math.round(
      ((completedFields + completedDocuments) / Math.max(totalParts, 1)) * 100,
    );
    const date = application.submitted_at || application.created_at;

    return {
      id: application.id,
      displayId: `SGMS-${application.id.slice(0, 6).toUpperCase()}`,
      callId: application.call_id,
      applicantId: application.applicant_id,
      direction: application.calls?.direction || 'SALIENTE',
      student: application.profiles?.full_name || application.profiles?.email || 'Estudiante',
      code: application.student_code || 'Pendiente',
      faculty: application.faculty || 'Pendiente',
      academicProgram: application.academic_program || '',
      destination: application.calls?.title || 'Convocatoria',
      callTitle: application.calls?.title || 'Convocatoria',
      motivation: application.motivation || '',
      currentStep: application.current_step || 1,
      status: application.status,
      submitted: date ? shortDate(String(date).slice(0, 10)) : 'Borrador',
      progress,
      documents: documents.map((document) => ({
        id: document.id,
        requirementId: document.requirement_id,
        name: document.requirement_title,
        required: document.is_required,
        storagePath: document.storage_path || '',
        fileName: document.file_name || '',
        status: document.status,
        reviewerComment: document.reviewer_comment || '',
      })),
      history: [
        [
          application.status.replaceAll('_', ' '),
          date ? new Date(date).toLocaleDateString('es-PE') : 'Sin fecha',
        ],
      ],
    };
  });
}

async function uploadDataUrl(dataUrl, path) {
  const response = await fetch(dataUrl);
  const blob = await response.blob();
  const { error } = await supabase.storage.from('call-assets').upload(path, blob, { upsert: true });
  if (error) throw error;
  return path;
}
function toast(msg) {
  const e = $('#toast');
  e.textContent = msg;
  e.classList.add('show');
  setTimeout(() => e.classList.remove('show'), 2300);
}
function badge(status) {
  const s = status.replaceAll('_', ' ');
  const cls = /APROBAD|ACTIVA|COMPLETO|CONFIRMADO/.test(status)
    ? 'ok'
    : /OBSERVAD|RECHAZAD/.test(status)
      ? 'bad'
      : /REVISION|VALIDACION|ENVIADA|SUBIDO/.test(status)
        ? 'info'
        : /PENDIENTE|BORRADOR|INVITACION/.test(status)
          ? 'warn'
          : 'neutral';
  return html`<span class="badge ${cls}">${esc(s)}</span>`;
}

// -----------------------------------------------------------------------------
// Autenticación, registro y sesión (Supabase Auth)
// -----------------------------------------------------------------------------
function login() {
  session = null;
  $('#app').innerHTML = html`<main class="login-shell">
    <section class="login-brand">
      <div class="brand">
        <div class="seal">S</div>
        <div>
          <div class="brand-name">SIGMA OCRI</div>
          <div class="brand-sub">UNIVERSIDAD NACIONAL DE SAN ANTONIO ABAD DEL CUSCO</div>
        </div>
      </div>
      <div class="hero">
        <div class="eyebrow">Movilidad académica</div>
        <h1>Conectamos talento<br />con el <span>mundo.</span></h1>
        <p>
          Una plataforma integral para gestionar postulaciones, documentos, evaluaciones y
          experiencias de movilidad académica.
        </p>
      </div>
      <div class="module-pills">
        <span>SGMS · Movilidad saliente</span><span>SGME · Movilidad entrante</span
        ><span>OCRI · Gestión institucional</span>
      </div>
    </section>
    <section class="login-panel">
      <div class="login-box">
        <div class="eyebrow">Bienvenido</div>
        <h2>Acceder a SIGMA</h2>
        <p>Ingresa con el correo y la contraseña que configuraste al verificar tu cuenta.</p>
        ${
          supabase
            ? html`<form class="role-grid" onsubmit="signIn(event)">
                  <div class="field">
                    <label>Correo</label
                    ><input
                      class="input"
                      name="email"
                      type="email"
                      autocomplete="email"
                      placeholder="codigo@unsaac.edu.pe"
                      required
                    />
                  </div>
                  <div class="field">
                    <label>Contraseña</label
                    ><input
                      class="input"
                      name="password"
                      type="password"
                      autocomplete="current-password"
                      placeholder="Tu contraseña"
                      required
                    />
                  </div>
                  <button class="btn btn-primary" type="submit">Iniciar sesión</button
                  ><button class="btn btn-soft" type="button" onclick="requestPasswordReset()">
                    Olvidé mi contraseña
                  </button>
                </form>
                <button
                  class="btn btn-gold"
                  style="width:100%;margin-top:4px"
                  onclick="showRegister()"
                >
                  Crear mi cuenta
                </button>
                <p class="login-note">
                  La verificación por enlace se usa solo al crear una cuenta o recuperar la
                  contraseña.
                </p>`
            : html`<p class="login-note">
                Falta la configuración local de Supabase. Copie <code>.env.example</code> a
                <code>.env.local</code> antes de iniciar la aplicación.
              </p>`
        }
      </div>
    </section>
  </main>`;
}
// Acceso ordinario: solo correo y contraseña; el enlace se reserva para verificar o recuperar.
async function signIn(event) {
  event.preventDefault();
  const f = Object.fromEntries(new FormData(event.target));
  const { error } = await supabase.auth.signInWithPassword({
    email: f.email,
    password: f.password,
  });
  if (error) toast('Correo o contraseña incorrectos.');
}
async function requestPasswordReset() {
  const email = document.querySelector('[name="email"]')?.value?.trim();
  if (!email) return toast('Ingrese primero su correo.');
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: window.location.origin,
  });
  toast(error ? error.message : 'Enlace de recuperación enviado. Revise su correo de pruebas.');
}
function showRegister() {
  modal(
    html`<div class="modal-head">
        <h2>Crear mi cuenta</h2>
        <button class="modal-close" onclick="closeModal()">×</button>
      </div>
      <p class="muted">
        Verificaremos que el correo le pertenece. Después del enlace podrá crear su contraseña
        personal.
      </p>
      <form class="form-grid" onsubmit="register(event)">
        <div class="field wide">
          <label>Nombre completo</label><input class="input" name="fullName" required />
        </div>
        <div class="field wide">
          <label>Correo institucional o universitario</label
          ><input class="input" name="email" type="email" required />
        </div>
        <div class="modal-actions wide">
          <button type="button" class="btn btn-soft" onclick="closeModal()">Cancelar</button
          ><button class="btn btn-primary">Enviar verificación</button>
        </div>
      </form>`,
  );
}
async function register(event) {
  event.preventDefault();
  const f = Object.fromEntries(new FormData(event.target));
  const { data: approved, error: domainError } = await supabase.rpc(
    'is_registration_domain_approved',
    { candidate_email: f.email },
  );
  if (domainError) return toast('No fue posible validar el dominio institucional.');
  if (!approved)
    return toast(
      'No puede registrarse: necesita un correo de una universidad con asociación o convenio vigente con UNSAAC.',
    );
  const { error } = await supabase.auth.signInWithOtp({
    email: f.email,
    options: {
      shouldCreateUser: true,
      data: { full_name: f.fullName },
      emailRedirectTo: window.location.origin,
    },
  });
  if (error) return toast(error.message);
  closeModal();
  toast('Enlace de verificación enviado. Revise el correo de pruebas.');
}
function passwordSetup() {
  const recovery = passwordRecoveryMode;
  $('#app').innerHTML = html`<main class="login-shell">
    <section class="login-brand">
      <div class="brand">
        <div class="seal">S</div>
        <div>
          <div class="brand-name">SIGMA OCRI</div>
          <div class="brand-sub">UNSAAC</div>
        </div>
      </div>
      <div class="hero">
        <div class="eyebrow">Cuenta verificada</div>
        <h1>Protege tu<br /><span>acceso.</span></h1>
        <p>
          Tu correo ya fue verificado. Define una contraseña personal para los próximos ingresos.
        </p>
      </div>
    </section>
    <section class="login-panel">
      <div class="login-box">
        <div class="eyebrow">${recovery ? 'Recuperación' : 'Último paso'}</div>
        <h2>${recovery ? 'Nueva contraseña' : 'Crea tu contraseña'}</h2>
        <p>Usarás esta contraseña junto con tu correo en los siguientes accesos.</p>
        <form class="role-grid" onsubmit="setPassword(event)">
          <div class="field">
            <label>Nueva contraseña</label
            ><input
              class="input"
              name="password"
              type="password"
              autocomplete="new-password"
              minlength="8"
              required
            />
          </div>
          <div class="field">
            <label>Confirmar contraseña</label
            ><input
              class="input"
              name="confirmation"
              type="password"
              autocomplete="new-password"
              minlength="8"
              required
            />
          </div>
          <button class="btn btn-primary" type="submit">Guardar contraseña</button>
        </form>
      </div>
    </section>
  </main>`;
}
async function setPassword(event) {
  event.preventDefault();
  const f = Object.fromEntries(new FormData(event.target));
  if (f.password !== f.confirmation) return toast('Las contraseñas no coinciden.');
  const { error } = await supabase.auth.updateUser({ password: f.password });
  if (error) return toast(error.message);
  const { error: profileError } = await supabase
    .from('profiles')
    .update({ password_configured_at: new Date().toISOString() })
    .eq('user_id', session.userId);
  if (profileError) return toast(profileError.message);
  passwordRecoveryMode = false;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) await loadSession(user);
  toast('Contraseña configurada correctamente.');
}
async function signOut() {
  await supabase.auth.signOut();
  login();
  toast('Sesión cerrada');
}
async function loadSession(user) {
  const previousUserId = session?.userId;
  const [{ data: profileResult, error: profileError }, { data: roleResult, error: roleError }] =
    await Promise.all([
      supabase
        .from('profiles')
        .select(
          'full_name,status,email,password_configured_at,phone,address,photo_path,universities(name)',
        )
        .eq('user_id', user.id)
        .single(),
      supabase.from('user_roles').select('roles(code,name)').eq('user_id', user.id).limit(1),
    ]);
  if (profileError) {
    toast(`No se pudo cargar el perfil: ${profileError.message}`);
    return login();
  }
  if (roleError) {
    toast(`No se pudo cargar el rol: ${roleError.message}`);
    return login();
  }
  const roleCode = roleResult?.[0]?.roles?.code;
  const fullName = profileResult.full_name || user.user_metadata?.full_name || user.email;
  const signedPhoto = profileResult.photo_path
    ? await supabase.storage
        .from('profile-photos')
        .createSignedUrl(profileResult.photo_path, 60 * 30)
    : null;
  const photoUrl = signedPhoto?.data?.signedUrl
    ? `${signedPhoto.data.signedUrl}&updated=${Date.now()}`
    : '';
  session = {
    userId: user.id,
    email: user.email,
    name: fullName,
    label: roleCode ? ROLE_LABELS[roleCode] : `Cuenta ${profileResult.status.toLowerCase()}`,
    initials: fullName
      .split(/\s+/)
      .slice(0, 2)
      .map((n) => n[0])
      .join('')
      .toUpperCase(),
    role: ROLE_VIEWS[roleCode] || 'pending',
    status: profileResult.status,
    university: profileResult.universities?.name || null,
    phone: profileResult.phone || '',
    address: profileResult.address || '',
    photoPath: profileResult.photo_path || '',
    photoUrl,
  };
  if (passwordRecoveryMode || !profileResult.password_configured_at) return passwordSetup();
  if (previousUserId !== user.id) route = 'dashboard';
  await loadCallsFromDatabase();
  await loadApplicationsFromDatabase();
  render();
}
function portalMeta() {
  if (session.role === 'student')
    return {
      module: 'MOVILIDAD SALIENTE · SGMS',
      section: 'MI MOVILIDAD',
      menu: [
        ['dashboard', 'Inicio'],
        ['calls', 'Convocatorias'],
        ['sgms', 'Mi postulación'],
        ['profile', 'Mi perfil'],
        ['documents', 'Documentos'],
        ['tracking', 'Seguimiento'],
      ],
    };
  if (session.role === 'external')
    return {
      module: 'MOVILIDAD ENTRANTE · SGME',
      section: 'MI EXPERIENCIA UNSAAC',
      menu: [
        ['dashboard', 'Inicio'],
        ['sgme', 'Mi nominación'],
        ['profile', 'Perfil y estudios'],
        ['documents', 'Documentos'],
        ['tracking', 'Seguimiento'],
      ],
    };
  if (session.role === 'external_manager')
    return {
      module: 'SGME · GESTOR EXTERNO',
      section: (session.university || 'Universidad asociada').toUpperCase(),
      menu: [
        ['dashboard', 'Nominaciones'],
        ['nominations', 'Nueva nominación'],
        ['documents', 'Guía de documentos'],
        ['profile', 'Perfil institucional'],
      ],
    };
  return {
    module: 'OFICINA DE COOPERACIÓN Y RELACIONES INTERNACIONALES',
    section: 'PANEL OCRI',
    menu: [
      ['dashboard', 'Resumen institucional'],
      ['calls', 'Convocatorias'],
      ['sgms', 'SGMS · Salidas UNSAAC'],
      ['sgme', 'SGME · Ingresos a UNSAAC'],
      ['nominations', 'SGME · Nominaciones recibidas'],
      ['access', 'Accesos y universidades'],
      ['profile', 'Mi perfil'],
    ],
  };
}

// -----------------------------------------------------------------------------
// Estructura del portal y vistas por rol
// -----------------------------------------------------------------------------
function render() {
  if (!session) return login();
  if (session.role === 'pending') return accessPending();
  const portal = portalMeta();
  const navigation = portal.menu
    .map(
      ([target, label]) =>
        html`<button class="${target === route ? 'active' : ''}" onclick="go('${target}')">
          ${label}
        </button>`,
    )
    .join('');
  const context = session.role === 'admin' ? '2026-II · Vista administrativa' : esc(session.name);
  $('#app').innerHTML = html`<div class="portal-shell">
    <header class="portal-header">
      <div class="portal-header-start">
        <button
          class="icon-button mobile-menu"
          aria-label="Abrir navegación"
          onclick="$('#sidebar').classList.toggle('open')"
        >
          ☰</button
        ><strong class="portal-wordmark">SIGMA</strong
        ><span class="portal-module">${portal.module}</span>
      </div>
      <div class="portal-header-end">
        <span class="portal-context">${context}</span>
        <i aria-label="Escudo UNSAAC"></i>
      </div>
    </header>
    <div class="app-shell">
      <aside class="sidebar" id="sidebar">
        <div class="sidebar-section">${esc(portal.section)}</div>
        <nav class="nav">${navigation}</nav>
        <div class="sidebar-foot">
          <button class="sidebar-profile" onclick="go('profile')" title="Abrir mi perfil">
            <span class="sidebar-avatar">
              ${
                session.photoUrl
                  ? html`<img src="${esc(session.photoUrl)}" alt="" />`
                  : esc(session.initials)
              }
            </span>
            <span class="sidebar-profile-copy">
              <strong>${esc(session.name)}</strong>
              <small>Mi perfil</small>
            </span>
          </button>
          <button class="logout" onclick="signOut()">Cerrar sesión</button>
        </div>
      </aside>
      <main class="main"><section class="content" id="view"></section></main>
    </div>
  </div>`;
  views[route]?.();
}
function accessPending() {
  $('#app').innerHTML = html`<main class="login-shell">
    <section class="login-brand">
      <div class="brand">
        <div class="seal">S</div>
        <div>
          <div class="brand-name">SIGMA OCRI</div>
          <div class="brand-sub">UNSAAC</div>
        </div>
      </div>
      <div class="hero">
        <div class="eyebrow">Solicitud recibida</div>
        <h1>Tu cuenta está<br /><span>pendiente.</span></h1>
        <p>
          OCRI validará tu identidad institucional o universidad de origen antes de asignarte un
          rol.
        </p>
      </div>
    </section>
    <section class="login-panel">
      <div class="login-box">
        <div class="eyebrow">Acceso restringido</div>
        <h2>Cuenta registrada</h2>
        <p>
          Se creó correctamente el perfil para <strong>${esc(session.email)}</strong>. Aún no tiene
          un rol habilitado, por lo que no puede acceder a los módulos.
        </p>
        <div class="card">
          <div class="stat-label">Estado de la cuenta</div>
          <div style="margin-top:12px">${badge(session.status)}</div>
        </div>
        <button class="btn btn-soft" style="margin-top:20px" onclick="signOut()">
          Cerrar sesión
        </button>
      </div>
    </section>
  </main>`;
}
function go(r) {
  route = r;
  render();
}
function head(title, desc, action = '') {
  return html`<div class="page-head">
    <div>
      <h1>${title}</h1>
      <p>${desc}</p>
    </div>
    ${action}
  </div>`;
}
function filteredApps(dir) {
  let a = state.applications.filter((x) => x.direction === dir);
  if (['student', 'external'].includes(session.role))
    a = a.filter((x) => x.applicantId === session.userId);
  if (session.role === 'external_manager')
    a = a.filter((x) => session.university && x.destination.includes(session.university));
  return a;
}

// Cada vista llena únicamente el contenedor #view de la estructura principal.
const views = {
  async access() {
    const view = $('#view');
    view.innerHTML =
      head(
        'Administración de accesos',
        'OCRI aprueba universidades y designa directamente a los gestores externos.',
      ) + '<div class="card">Cargando información de acceso…</div>';
    const [
      { data: universities, error: universityError },
      { data: profiles, error: profileError },
    ] = await Promise.all([
      supabase
        .from('universities')
        .select(
          'id,name,country,is_unsaac,is_active,university_email_domains(email_domain,is_verified,is_active)',
        )
        .order('is_unsaac', { ascending: false })
        .order('name'),
      supabase
        .from('profiles')
        .select(
          'user_id,email,full_name,status,universities(id,name),user_roles!user_roles_user_id_fkey(roles(code,name))',
        )
        .order('created_at', { ascending: false }),
    ]);
    if (universityError || profileError) {
      view.innerHTML =
        head('Administración de accesos', 'No fue posible cargar los datos.') +
        html`<div class="card">${esc(universityError?.message || profileError?.message)}</div>`;
      return;
    }
    accessProfiles = profiles;
    const externalUniversities = universities.filter((u) => !u.is_unsaac),
      managers = profiles.filter((p) =>
        p.user_roles?.some((ur) => ur.roles?.code === 'GESTOR_EXTERNO'),
      );
    view.innerHTML =
      head(
        'Administración de accesos',
        'OCRI aprueba universidades y designa directamente a los gestores externos.',
        html`<button class="btn btn-primary" onclick="universityModal()">
          + Registrar universidad
        </button>`,
      ) +
      html`<div class="grid-2">
        <div class="card">
          <div class="section-title">
            <h3>Universidades y dominios</h3>
            <span class="badge info">${universities.length}</span>
          </div>
          ${universities
            .map(
              (u) =>
                html`<div class="doc-item">
                  <div class="doc-icon">UNI</div>
                  <div class="doc-main">
                    <strong>${esc(u.name)}</strong
                    ><small
                      >${esc(u.country || 'Sin país')} ·
                      ${(u.university_email_domains || []).map((d) => esc(d.email_domain)).join(', ') || 'Sin dominio'}</small
                    >
                  </div>
                  ${badge(u.is_active ? 'ACTIVA' : 'SUSPENDIDA')}
                </div>`,
            )
            .join('')}
        </div>
        <div class="card">
          <h3>Designar gestor externo</h3>
          <p class="muted">Escriba el correo institucional de la persona oficialmente designada.</p>
          <form class="form-grid" onsubmit="designateExternalManager(event)">
            <div class="field wide">
              <label>Correo de la persona designada</label
              ><input
                class="input"
                name="email"
                type="email"
                placeholder="encargado@universidad.edu"
                required
              />
            </div>
            <div class="modal-actions wide">
              <button class="btn btn-primary">Asignar GESTOR EXTERNO</button>
            </div>
          </form>
          <h3 style="margin-top:28px">Gestores por universidad</h3>
          ${
            externalUniversities.length
              ? externalUniversities
                  .map((u) => {
                    const manager = managers.find((p) => p.universities?.id === u.id);
                    return html`<div class="doc-item">
                      <div class="doc-icon">EXT</div>
                      <div class="doc-main">
                        <strong>${esc(u.name)}</strong
                        ><small
                          >${manager ? esc(manager.full_name || manager.email) + ' · ' + esc(manager.email) : 'Sin gestor asignado'}</small
                        >
                      </div>
                      ${manager ? badge('ACTIVO') : badge('PENDIENTE')}
                    </div>`;
                  })
                  .join('')
              : '<p class="muted">Aún no hay universidades externas aprobadas.</p>'
          }
        </div>
      </div>`;
  },
  dashboard() {
    const apps = state.applications;
    if (session.role === 'student') return studentDashboard();
    if (session.role === 'external') return externalStudentDashboard();
    if (session.role === 'external_manager') return managerDashboard();
    const outbound = apps.filter((a) => a.direction === 'SALIENTE').length;
    const inbound = apps.filter((a) => a.direction === 'ENTRANTE').length;
    const pending = apps.filter((a) => /REVISION|VALIDACION|OBSERVADO/.test(a.status)).length;
    const published = state.calls.filter((c) => c.status === 'ACTIVA').length;
    $('#view').innerHTML = html`<div class="dashboard-heading">
        <div class="eyebrow">Panel OCRI · gestión institucional</div>
        <h1>Control de movilidad, con cada flujo claramente separado.</h1>
        <p>
          <strong>SGMS</strong>: estudiantes UNSAAC que postulan a salir. <strong>SGME</strong>:
          estudiantes de universidades asociadas que ingresan a la UNSAAC mediante una nominación.
        </p>
      </div>
      <div class="dashboard-stats">
        <article class="dashboard-stat accent-maroon">
          <strong>${outbound}</strong
          ><span
            >SGMS · postulaciones salientes<small
              >Estudiantes UNSAAC hacia universidades de destino</small
            ></span
          >
        </article>
        <article class="dashboard-stat accent-gold">
          <strong>${inbound}</strong
          ><span
            >SGME · nominaciones entrantes<small
              >Universidades asociadas proponen estudiantes para la UNSAAC</small
            ></span
          >
        </article>
        <article class="dashboard-stat accent-maroon">
          <strong>${pending}</strong
          ><span>Expedientes por revisar<small>Documentos y validaciones SGMS / SGME</small></span>
        </article>
        <article class="dashboard-stat accent-gold">
          <strong>${published}</strong
          ><span>Convocatorias publicadas<small>Oportunidades activas del periodo</small></span>
        </article>
      </div>
      <div class="dashboard-columns admin-columns">
        <article class="card activity-card">
          <h3>Actividad reciente</h3>
          <div class="activity-item">
            <strong
              >SGMS ·
              ${esc(state.calls.find((c) => c.direction === 'SALIENTE' && c.status === 'ACTIVA')?.title || 'Convocatoria saliente 2026-II')}
              publicada</strong
            ><span>Estudiantes UNSAAC pueden revisar requisitos y postular.</span>
          </div>
          <div class="activity-item">
            <strong>SGME · ${state.nominations.length} nominaciones recibidas</strong
            ><span
              >Estudiantes propuestos por universidades asociadas para ingresar a la UNSAAC.</span
            >
          </div>
        </article>
        <aside class="priority-card">
          <h3>Acciones prioritarias</h3>
          <button onclick="callModal()">＋ Crear convocatoria</button
          ><button onclick="go('nominations')">✓ Revisar nominaciones SGME</button
          ><button onclick="go('access')">⚙ Gestionar accesos y universidades</button>
        </aside>
      </div>`;
  },
  calls() {
    const canEdit = /admin/.test(session.role);
    const visibleCalls = state.calls.filter((call) => {
      if (session.role === 'student') return call.direction === 'SALIENTE';
      if (session.role === 'external') return call.direction === 'ENTRANTE';
      return true;
    });
    const showDirectionFilter = canEdit;
    $('#view').innerHTML =
      head(
        'Convocatorias',
        'Oportunidades y periodos de movilidad académica.',
        canEdit
          ? html`<button class="btn btn-primary" onclick="callModal()">
              + Nueva convocatoria
            </button>`
          : '',
      ) +
      html`${
          showDirectionFilter
            ? html`<div class="filters">
                <select class="input" onchange="filterCards(this.value)">
                  <option value="">Todas las direcciones</option>
                  <option>SALIENTE</option>
                  <option>ENTRANTE</option>
                </select>
              </div>`
            : ''
        }
        <div class="call-grid" id="callGrid">
          ${
            visibleCalls.length
              ? visibleCalls.map((call) => callCard(call, canEdit)).join('')
              : '<div class="empty">No hay convocatorias disponibles en este momento.</div>'
          }
        </div>`;
  },
  sgms() {
    appView(
      'SALIENTE',
      'SGMS · Movilidad saliente',
      'Postulaciones de alumnos UNSAAC hacia universidades de destino.',
    );
  },
  sgme() {
    appView(
      'ENTRANTE',
      'SGME · Movilidad entrante',
      'Postulaciones de estudiantes externos hacia la UNSAAC.',
    );
  },
  nominations() {
    const action = /admin|external_manager/.test(session.role)
      ? html`<button class="btn btn-primary" onclick="nominationModal()">
          + Nueva nominación
        </button>`
      : '';
    const nominations =
      session.role === 'external_manager'
        ? state.nominations.filter((n) => n.university === session.university)
        : state.nominations;
    const isAdmin = session.role === 'admin';
    $('#view').innerHTML =
      head(
        isAdmin ? 'Nominaciones recibidas · SGME' : 'Nominaciones de tu universidad',
        isAdmin
          ? 'Estudiantes propuestos por universidades asociadas para realizar movilidad entrante en la UNSAAC. No corresponde a postulaciones salientes de estudiantes UNSAAC.'
          : `Procesos de ${session.university || 'su universidad'} hacia la UNSAAC.`,
        action,
      ) + html`<div class="card">${nomTable(nominations)}</div>`;
  },
  documents() {
    let apps = state.applications;
    if (session.role === 'student') apps = filteredApps('SALIENTE');
    if (session.role === 'external') apps = filteredApps('ENTRANTE');
    const docs = apps.flatMap((a) => a.documents.map((d, i) => ({ ...d, app: a, index: i })));
    $('#view').innerHTML =
      head(
        'Gestión documental',
        'Revisión individual, observaciones y trazabilidad de documentos.',
      ) +
      html`<div class="card">
        <div class="doc-list">
          ${docs
            .map(
              (d) =>
                html`<div class="doc-item">
                  <div class="doc-icon">PDF</div>
                  <div class="doc-main">
                    <strong>${esc(d.name)}</strong
                    ><small>${d.app.id} · ${esc(d.app.student)}</small>
                  </div>
                  ${badge(d.status)}${/admin|reviewer/.test(session.role) ? html`<button class="btn btn-sm btn-soft" onclick="reviewModal('${d.app.id}',${d.index})">Revisar</button>` : ''}
                </div>`,
            )
            .join('')}
        </div>
      </div>`;
  },
  reports() {
    const faculties = {};
    state.applications.forEach((a) => (faculties[a.faculty] = (faculties[a.faculty] || 0) + 1));
    $('#view').innerHTML =
      head(
        'Reportes',
        'Indicadores consolidados y exportación de información.',
        html`<button class="btn btn-primary" onclick="exportCSV()">Exportar CSV</button>`,
      ) +
      html`<div class="cards">
          <div class="card stat">
            <div class="stat-label">Salientes</div>
            <div class="stat-value">${filteredApps('SALIENTE').length}</div>
          </div>
          <div class="card stat">
            <div class="stat-label">Entrantes</div>
            <div class="stat-value">${filteredApps('ENTRANTE').length}</div>
          </div>
          <div class="card stat">
            <div class="stat-label">Universidades</div>
            <div class="stat-value">5</div>
          </div>
          <div class="card stat">
            <div class="stat-label">Países</div>
            <div class="stat-value">4</div>
          </div>
        </div>
        <div class="grid-2">
          <div class="card">
            <h3>Postulantes por facultad</h3>
            ${Object.entries(faculties)
              .map(
                ([f, n]) =>
                  html`<p>${f} <strong style="float:right">${n}</strong></p>
                    <div class="progress"><span style="width:${n * 30}%"></span></div>`,
              )
              .join('')}
          </div>
          <div class="card">
            <h3>Estado de expedientes</h3>
            ${state.applications.map((a) => html`<p style="display:flex;justify-content:space-between"><span>${a.id}</span>${badge(a.status)}</p>`).join('')}
          </div>
        </div>`;
  },
  tracking() {
    trackingView();
  },
  profile() {
    profileView();
  },
};
function appView(dir, title, desc) {
  const apps = filteredApps(dir);
  const action =
    (session.role === 'student' && dir === 'SALIENTE') ||
    (session.role === 'external' && dir === 'ENTRANTE')
      ? html`<button class="btn btn-primary" onclick="go('calls')">Explorar convocatorias</button>`
      : '';
  $('#view').innerHTML =
    head(title, desc, action) +
    html`<div class="cards">
        <div class="card stat">
          <div class="stat-label">Total</div>
          <div class="stat-value">${apps.length}</div>
        </div>
        <div class="card stat">
          <div class="stat-label">En proceso</div>
          <div class="stat-value">
            ${apps.filter((a) => !/APROBAD|FINALIZAD/.test(a.status)).length}
          </div>
        </div>
        <div class="card stat">
          <div class="stat-label">Observados</div>
          <div class="stat-value">${apps.filter((a) => a.status === 'OBSERVADO').length}</div>
        </div>
        <div class="card stat">
          <div class="stat-label">Aprobados</div>
          <div class="stat-value">${apps.filter((a) => /APROBAD/.test(a.status)).length}</div>
        </div>
      </div>
      <div class="card">
        ${apps.length ? appTable(apps) : '<div class="empty">No hay postulaciones registradas.</div>'}
      </div>`;
}
function studentDashboard() {
  const application = filteredApps('SALIENTE')[0],
    call =
      state.calls.find((c) => c.direction === 'SALIENTE' && c.status === 'ACTIVA') ||
      state.calls.find((c) => c.direction === 'SALIENTE');
  const progress = application?.progress || 0;
  const completed = application?.documents.filter((d) => d.status === 'APROBADO').length || 0;
  $('#view').innerHTML = html`<div class="dashboard-heading">
      <h1>Hola, ${esc(session.name.split(' ')[0])}.</h1>
      <p>Estas son las oportunidades y tareas de tu movilidad saliente.</p>
    </div>
    <article class="card journey-card">
      <div>
        <h3>Tu postulación · ${esc(call?.title || 'Movilidad académica')}</h3>
        <p>${completed} documentos aprobados · avance ${progress}%</p>
        <div class="progress"><span style="width:${progress}%"></span></div>
      </div>
      <button class="btn btn-primary" onclick="go('tracking')">Ver seguimiento</button>
    </article>
    <div class="dashboard-columns student-columns">
      <article class="card opportunity-card">
        <div class="eyebrow">Convocatoria abierta</div>
        <h2>${esc(call?.title || 'Movilidad académica')}</h2>
        <button class="btn btn-primary" onclick="go('calls')">Ver y postular</button>
      </article>
      <aside class="priority-card">
        <h3>Próximas acciones</h3>
        <ul>
          <li>Revisar los requisitos de la convocatoria</li>
          <li>Completar documentos pendientes</li>
          <li>Enviar postulación antes del cierre</li>
        </ul>
      </aside>
    </div>`;
}
function externalStudentDashboard() {
  const application = filteredApps('ENTRANTE')[0],
    university = application?.destination || session.university || 'Universidad de origen';
  $('#view').innerHTML = html`<div class="dashboard-heading external-heading">
      <div class="eyebrow">Movilidad entrante · 2026-II</div>
      <h1>Bienvenida a tu movilidad en la UNSAAC</h1>
      <p>
        Tu universidad te ha nominado. Completa la información solicitada para que OCRI valide tu
        ingreso.
      </p>
    </div>
    <article class="card journey-card external-status">
      <div>
        <h3>Nominación recibida · ${esc(university)}</h3>
        <p>Siguiente paso: completar perfil académico y documentos de ingreso.</p>
      </div>
      <button class="btn btn-primary" onclick="go('profile')">Completar perfil</button>
    </article>
    <article class="arrival-route">
      <h3>Tu ruta de ingreso</h3>
      <ol>
        <li class="current">01&nbsp;&nbsp; Nominación recibida</li>
        <li>02&nbsp;&nbsp; Perfil académico</li>
        <li>03&nbsp;&nbsp; Documentos y validación</li>
        <li>04&nbsp;&nbsp; Carta de aceptación</li>
      </ol>
    </article>`;
}
function managerDashboard() {
  const university = session.university || 'su universidad',
    nominations = state.nominations.filter((n) => n.university === session.university);
  $('#view').innerHTML = html`<div class="dashboard-heading manager-heading">
      <h1>Nominaciones de tu universidad</h1>
      <p>Solo ves y administras procesos de ${esc(university)}.</p>
      <button class="btn btn-primary" onclick="nominationModal()">＋ Nueva nominación</button>
    </div>
    <article class="card manager-table">
      <div class="manager-table-head">
        <span>Estudiante</span><span>Programa</span><span>Periodo</span><span>Estado</span>
      </div>
      ${
        nominations.length
          ? nominations
              .map(
                (n) =>
                  html`<div class="manager-row">
                    <strong>${esc(n.student)}<small>${esc(n.email)}</small></strong
                    ><span>Movilidad académica</span><span>2026-II</span>${badge(n.status)}
                  </div>`,
              )
              .join('')
          : '<div class="empty">Aún no hay nominaciones registradas.</div>'
      }
    </article>`;
}
function trackingView() {
  const application = filteredApps(session.role === 'student' ? 'SALIENTE' : 'ENTRANTE')[0];
  $('#view').innerHTML = application
    ? head('Seguimiento de postulación', 'Revisa el avance y los documentos de tu expediente.') +
      applicationDetail(application)
    : head('Seguimiento', 'Aún no hay una postulación registrada.') +
      '<div class="empty">Cuando inicies una postulación, su seguimiento aparecerá aquí.</div>';
}
function profileView() {
  if (pendingProfilePhotoPreview) {
    URL.revokeObjectURL(pendingProfilePhotoPreview);
    pendingProfilePhotoPreview = '';
  }
  const title = session.role === 'external_manager' ? 'Perfil institucional' : 'Mi perfil';
  const description =
    session.role === 'external_manager'
      ? 'Datos de contacto de la universidad y de la persona responsable.'
      : 'Actualiza tus datos personales.';
  const hasStoredPhoto = Boolean(session.photoPath);
  const photo = session.photoUrl
    ? html`<img src="${esc(session.photoUrl)}" alt="Foto de perfil de ${esc(session.name)}" />`
    : esc(session.initials);
  const photoActions = hasStoredPhoto
    ? html`<div class="profile-avatar-actions">
        <button type="button" onclick="viewProfilePhoto()">Ver foto</button>
        <button type="button" onclick="selectProfilePhoto()">Actualizar</button>
      </div>`
    : html`<button
        type="button"
        class="profile-avatar-required"
        onclick="selectProfilePhoto()"
        aria-label="Agregar foto de perfil obligatoria"
      >
        <span>Agregar foto</span>
        <small>Obligatoria</small>
      </button>`;
  $('#view').innerHTML =
    head(title, description) +
    html`<article class="card profile-card profile-editor">
      <div class="profile-photo-column">
        <div
          class="profile-avatar-control ${hasStoredPhoto ? 'has-photo' : 'is-required'}"
          id="profile-avatar-control"
        >
          <div class="profile-avatar" id="profile-avatar-media">${photo}</div>
          <div id="profile-avatar-actions">${photoActions}</div>
        </div>
        <input
          class="visually-hidden"
          id="profile-photo-input"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onchange="previewProfilePhoto(event)"
        />
        <strong>${esc(session.name)}</strong>
        <small>${esc(session.label)}</small>
        <div class="profile-photo-notice" id="profile-photo-notice">
          <strong>Foto oficial</strong>
          <span
            >Utiliza una fotografía tipo carnet con fondo blanco. Será empleada en tus trámites de
            movilidad.</span
          >
        </div>
      </div>
      <form class="form-grid profile-form" id="profile-form" onsubmit="saveProfile(event)">
        <div class="field">
          <label>Nombre completo</label
          ><input class="input" name="fullName" value="${esc(session.name)}" required />
        </div>
        <div class="field">
          <label>Correo institucional</label
          ><input class="input" value="${esc(session.email)}" readonly aria-readonly="true" />
        </div>
        <div class="field">
          <label>Teléfono <span class="muted">(opcional)</span></label
          ><input
            class="input"
            name="phone"
            value="${esc(session.phone)}"
            placeholder="Ej. +51 999 999 999"
          />
        </div>
        <div class="field">
          <label>Dirección <span class="muted">(opcional)</span></label
          ><input
            class="input"
            name="address"
            value="${esc(session.address)}"
            placeholder="Ciudad, distrito o referencia"
          />
        </div>
        <div class="field wide">
          <label>Universidad</label
          ><input
            class="input"
            value="${esc(session.university || 'Universidad pendiente de confirmar')}"
            readonly
            aria-readonly="true"
          />
        </div>
        <div class="modal-actions wide">
          <button class="btn btn-primary">Guardar perfil</button>
        </div>
      </form>
    </article>`;
}
function selectProfilePhoto() {
  $('#profile-photo-input')?.click();
}
async function previewProfilePhoto(event) {
  const [photo] = event.target.files || [];
  if (!photo) return;

  const validTypes = ['image/jpeg', 'image/png', 'image/webp'];
  if (!validTypes.includes(photo.type)) {
    event.target.value = '';
    return toast('La foto debe ser JPG, PNG o WEBP.');
  }
  if (photo.size > 5 * 1024 * 1024) {
    event.target.value = '';
    return toast('La foto no puede superar los 5 MB.');
  }

  if (pendingProfilePhotoPreview) URL.revokeObjectURL(pendingProfilePhotoPreview);
  pendingProfilePhotoPreview = URL.createObjectURL(photo);
  $('#profile-avatar-media').innerHTML = html`<img
    src="${esc(pendingProfilePhotoPreview)}"
    alt="Vista previa de la nueva foto de perfil"
  />`;
  $('#profile-avatar-control').className = 'profile-avatar-control has-photo';
  $('#profile-avatar-actions').innerHTML = html`<div class="profile-avatar-actions">
    <button type="button" onclick="viewProfilePhoto()">Ver foto</button>
    <button type="button" onclick="selectProfilePhoto()">Cambiar</button>
  </div>`;
  const notice = $('#profile-photo-notice');
  notice.querySelector('strong').textContent = 'Subiendo foto…';
  notice.querySelector('span').textContent = 'Espera un momento mientras se actualiza tu perfil.';

  const extension = photo.type === 'image/jpeg' ? 'jpg' : photo.type.split('/')[1];
  const photoPath = `${session.userId}/foto-perfil.${extension}`;
  const previousPhotoPath = session.photoPath;
  const { error: uploadError } = await supabase.storage
    .from('profile-photos')
    .upload(photoPath, photo, { upsert: true, contentType: photo.type });
  if (uploadError) {
    profileView();
    return toast(`No se pudo subir la foto: ${uploadError.message}`);
  }

  const { error: profileError } = await supabase
    .from('profiles')
    .update({ photo_path: photoPath, updated_at: new Date().toISOString() })
    .eq('user_id', session.userId);
  if (profileError && previousPhotoPath !== photoPath) {
    await supabase.storage.from('profile-photos').remove([photoPath]);
    profileView();
    return toast(`No se pudo registrar la foto: ${profileError.message}`);
  }
  if (previousPhotoPath && previousPhotoPath !== photoPath)
    await supabase.storage.from('profile-photos').remove([previousPhotoPath]);

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) await loadSession(user);
  toast('Foto de perfil actualizada.');
}
function viewProfilePhoto() {
  const photoUrl = pendingProfilePhotoPreview || session.photoUrl;
  if (!photoUrl)
    return toast('No se pudo abrir la foto guardada. Recarga la página e inténtalo otra vez.');

  modal(
    html`<div class="modal-head">
        <h2>Foto de perfil</h2>
        <button class="modal-close" onclick="closeModal()" aria-label="Cerrar">×</button>
      </div>
      <div class="profile-photo-preview">
        <img src="${esc(photoUrl)}" alt="Foto de perfil de ${esc(session.name)}" />
      </div>
      <div class="modal-actions">
        <button class="btn btn-soft" type="button" onclick="closeModal()">Cerrar</button>
        <button class="btn btn-primary" type="button" onclick="updateProfilePhotoFromPreview()">
          Actualizar foto
        </button>
      </div>`,
    'profile-photo-dialog',
  );
}
function updateProfilePhotoFromPreview() {
  closeModal();
  selectProfilePhoto();
}
async function saveProfile(event) {
  event.preventDefault();
  const form = new FormData(event.target);
  const profileUpdate = {
    full_name: form.get('fullName').trim(),
    phone: form.get('phone').trim() || null,
    address: form.get('address').trim() || null,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from('profiles')
    .update(profileUpdate)
    .eq('user_id', session.userId);
  if (error) return toast(`No se pudo guardar el perfil: ${error.message}`);

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) await loadSession(user);
  toast('Perfil actualizado.');
}

// -----------------------------------------------------------------------------
// Componentes de interfaz reutilizables
// -----------------------------------------------------------------------------
function appTable(apps) {
  return html`<div class="table-wrap">
    <table class="table">
      <thead>
        <tr>
          <th>Expediente</th>
          <th>Estudiante</th>
          <th>Facultad</th>
          <th>Universidad</th>
          <th>Estado</th>
          <th>Avance</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        ${apps
          .map(
            (a) =>
              html`<tr>
                <td>
                  <strong>${a.displayId || a.id}</strong><br /><small class="muted"
                    >${a.submitted}</small
                  >
                </td>
                <td>${esc(a.student)}<br /><small class="muted">${a.code}</small></td>
                <td>${esc(a.faculty)}</td>
                <td>${esc(a.destination)}</td>
                <td>${badge(a.status)}</td>
                <td>
                  <div class="progress" style="width:75px">
                    <span style="width:${a.progress}%"></span>
                  </div>
                </td>
                <td>
                  <button class="btn btn-sm btn-soft" onclick="detailModal('${a.id}')">Ver</button>
                </td>
              </tr>`,
          )
          .join('')}
      </tbody>
    </table>
  </div>`;
}
function applicationDetail(a) {
  return html`<div class="grid-2">
    <div class="card">
      <h3>Documentos del expediente</h3>
      <div class="doc-list">
        ${a.documents
          .map(
            (d) =>
              html`<div class="doc-item">
                <div class="doc-icon">PDF</div>
                <div class="doc-main">
                  <strong>${esc(d.name)}</strong><small>Documento requerido</small>
                </div>
                ${badge(d.status)}
              </div>`,
          )
          .join('')}
      </div>
    </div>
    <div class="card">
      <h3>Seguimiento</h3>
      <div class="timeline">
        ${a.history
          .map(
            (h) =>
              html`<div class="timeline-item">
                <div class="timeline-dot"></div>
                <div>
                  <strong>${esc(h[0])}</strong>
                  <p>${h[1]}</p>
                </div>
              </div>`,
          )
          .join('')}
      </div>
    </div>
  </div>`;
}
function callCard(c) {
  const cover = c.coverImage ? ` style="background-image:url('${esc(c.coverImage)}')"` : '';
  const titleSize = c.title.length > 58 ? 'is-extra-long' : c.title.length > 28 ? 'is-long' : '';
  return html`<article
    class="call-card"
    data-direction="${c.direction}"
    role="button"
    tabindex="0"
    aria-label="Abrir convocatoria ${esc(c.title)}"
    onclick="showCallSummary('${c.id}')"
    onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();showCallSummary('${c.id}')}"
  >
    <div class="call-cover${c.coverImage ? ' has-image' : ''}" ${cover}>
      <div class="call-flags">
        ${badge(c.status)}<span class="badge neutral">${c.direction}</span>
      </div>
      <span class="call-open-hint">Abrir convocatoria ↗</span>
    </div>
    <div class="call-body">
      <div class="call-title-row"><h3 class="${titleSize}">${esc(c.title)}</h3></div>
      <div class="call-meta-line">
        <strong>${esc(c.period)}</strong><span></span><b>Límite: ${shortDate(c.end)}</b>
      </div>
    </div>
  </article>`;
}
function nomTable(nominations = state.nominations) {
  return html`<div class="table-wrap">
    <table class="table">
      <thead>
        <tr>
          <th>Código</th>
          <th>Estudiante</th>
          <th>Universidad</th>
          <th>País</th>
          <th>Contacto</th>
          <th>Estado</th>
        </tr>
      </thead>
      <tbody>
        ${nominations
          .map(
            (n) =>
              html`<tr>
                <td><strong>${n.id}</strong></td>
                <td>${esc(n.student)}</td>
                <td>${esc(n.university)}</td>
                <td>${esc(n.country)}</td>
                <td>${esc(n.email)}</td>
                <td>${badge(n.status)}</td>
              </tr>`,
          )
          .join('')}
      </tbody>
    </table>
  </div>`;
}
function modal(body, variant = '') {
  document.body.insertAdjacentHTML(
    'beforeend',
    html`<div class="modal-backdrop ${variant ? `backdrop-${variant}` : ''}" id="modal">
      <div class="modal ${variant}">${body}</div>
    </div>`,
  );
}
function closeModal() {
  $('#modal')?.remove();
}

// -----------------------------------------------------------------------------
// Convocatorias: asistente de creación, edición y publicación local
// -----------------------------------------------------------------------------
function callModal() {
  editingCallId = null;
  callWizardStep = 1;
  callDraft = {
    title: '',
    direction: 'SALIENTE',
    period: nextAcademicPeriod(),
    end: '',
    coverImage: '',
    coverName: '',
    guidelinesText: '',
    guidelines: [],
    documents: [],
    resources: [],
    notice: { links: [] },
  };
  renderCallWizard();
}
function editCall(id) {
  const source = state.calls.find((call) => call.id === id);
  if (!source || session?.role !== 'admin') return;
  editingCallId = id;
  callWizardStep = 1;
  callDraft = structuredClone(source);
  callDraft.guidelines = callDraft.guidelines || [];
  callDraft.guidelinesText =
    callDraft.guidelinesText || callDraft.guidelines.map((item) => `• ${item}`).join('\n');
  callDraft.documents = callDraft.documents || [];
  callDraft.resources = callDraft.resources || [];
  callDraft.notice = { links: noticeLinks(callDraft.notice) };
  renderCallWizard();
}
function nextAcademicPeriod() {
  const year = new Date().getFullYear();
  return `${year + 1}-I`;
}
function periodOptions(selected) {
  const first = new Date().getFullYear(),
    options = [];
  for (let year = first; year <= first + 5; year += 1) {
    options.push(`${year}-I`, `${year}-II`);
  }
  return options
    .map(
      (period) =>
        html`<option value="${period}" ${period === selected ? 'selected' : ''}>${period}</option>`,
    )
    .join('');
}
function syncCallDraft() {
  const form = $('#callWizardForm');
  if (!form || !callDraft) return;
  const data = new FormData(form),
    has = (name) => Boolean(form.elements.namedItem(name)),
    text = (name, fallback = '') => (has(name) ? String(data.get(name) || '').trim() : fallback);
  if (has('title')) {
    callDraft.title = text('title', callDraft.title);
    callDraft.direction = text('direction', callDraft.direction);
    callDraft.period = text('period', callDraft.period);
    callDraft.end = text('end', callDraft.end);
  }
  if (has('guidelines_text')) {
    callDraft.guidelinesText = text('guidelines_text', callDraft.guidelinesText);
    callDraft.guidelines = callDraft.guidelinesText
      .split(/\r?\n/)
      .map((item) => item.trim().replace(/^[•*–-]\s*/, ''))
      .filter(Boolean);
  }
  if (has('document_title_0'))
    callDraft.documents = callDraft.documents.map((item, index) => ({
      title: text(`document_title_${index}`, item.title),
      description: text(`document_description_${index}`, item.description),
      required: has(`document_required_${index}`)
        ? data.get(`document_required_${index}`) === 'on'
        : item.required,
    }));
  if (has('resource_file_0'))
    callDraft.resources = callDraft.resources.map((item, index) => {
      const file = data.get(`resource_file_${index}`);
      return {
        ...item,
        description: text(`resource_description_${index}`, item.description),
        fileName: file instanceof File && file.name ? file.name : item.fileName,
      };
    });
  if (has('notice_link_label_0'))
    callDraft.notice = {
      links: (callDraft.notice.links || []).map((item, index) => ({
        label: text(`notice_link_label_${index}`, item.label),
        url: text(`notice_link_url_${index}`, item.url),
      })),
    };
}
function wizardNavigation() {
  const labels = ['Información', 'Requisitos', 'Documentos', 'Material OCRI', 'Revisión'];
  return html`<aside class="wizard-route">
    <div class="eyebrow">Ruta de publicación</div>
    <h3>Nueva convocatoria</h3>
    ${labels.map((label, index) => html`<button type="button" class="${callWizardStep === index + 1 ? 'active' : ''} ${callWizardStep > index + 1 ? 'done' : ''}" onclick="goCallWizardStep(${index + 1})"><span>0${index + 1}</span>${label}</button>`).join('')}
    <p>La convocatoria representa una universidad o convenio específico.</p>
  </aside>`;
}
function renderCallWizard() {
  const content = [
    wizardInformation,
    wizardGuidelines,
    wizardDocuments,
    wizardMaterials,
    wizardReview,
  ][callWizardStep - 1]();
  const titles = [
    '01 · Información general',
    '02 · Requisitos generales',
    '03 · Documentos a presentar',
    '04 · Material OCRI e información importante',
    '05 · Revisión y publicación',
  ];
  const flowLabel = editingCallId ? 'Editar convocatoria' : 'Nueva convocatoria';
  const body = html`<div class="wizard-shell">
    <header class="wizard-header">
      <div class="wizard-header-start">
        <strong>SIGMA</strong>
        <span>OFICINA DE COOPERACIÓN Y RELACIONES INTERNACIONALES</span>
      </div>
      <div class="wizard-header-end">
        <span>${callDraft.period} · ${flowLabel}</span>
        <i aria-label="Escudo UNSAAC"></i>
      </div>
    </header>
    <div class="wizard-layout">
      ${wizardNavigation()}
      <section class="wizard-main">
        <div class="modal-head">
          <div>
            <div class="eyebrow">Convocatorias / ${flowLabel}</div>
            <h2>${titles[callWizardStep - 1]}</h2>
          </div>
          <button class="wizard-exit" onclick="closeModal()">← Volver a convocatorias</button>
        </div>
        <form id="callWizardForm" onsubmit="return false">${content}</form>
      </section>
    </div>
  </div>`;
  const existing = $('#modal .modal');
  if (existing) {
    // El resumen abre como modal pequeño; al editar se transforma en el asistente completo.
    existing.className = 'modal modal-wizard';
    existing.innerHTML = body;
  } else modal(body, 'modal-wizard');
}
function wizardInformation() {
  return html`<p class="wizard-intro">
      El nombre identifica la universidad o convenio. Elige el periodo al costado para mantener el
      título claro y uniforme.
    </p>
    <div class="form-grid">
      <div class="field">
        <label>Nombre de la convocatoria</label
        ><input
          class="input"
          name="title"
          value="${esc(callDraft.title)}"
          placeholder="Intercambio académico · PUCP"
          required
        />
      </div>
      <div class="field">
        <label>Periodo académico</label
        ><select class="input" name="period">
          ${periodOptions(callDraft.period)}
        </select>
      </div>
      <div class="field">
        <label>Flujo de movilidad</label
        ><select class="input" name="direction" onchange="changeCallDirection(this.value)">
          <option value="SALIENTE" ${callDraft.direction === 'SALIENTE' ? 'selected' : ''}>
            SGMS · Saliente desde UNSAAC
          </option>
          <option value="ENTRANTE" ${callDraft.direction === 'ENTRANTE' ? 'selected' : ''}>
            SGME · Entrante hacia UNSAAC
          </option>
        </select>
      </div>
      <div class="field">
        <label>Imagen de portada <span class="muted">(opcional)</span></label
        ><input
          class="input"
          type="file"
          accept="image/png,image/jpeg,image/webp"
          onchange="selectCallCover(this)"
        /><small class="field-help"
          >${callDraft.coverName ? `Seleccionada: ${esc(callDraft.coverName)}` : 'PNG, JPG o WEBP'}</small
        >
      </div>
      <div class="field wide">
        <label>Fecha límite de postulación</label
        ><input class="input" type="date" name="end" value="${esc(callDraft.end)}" required />
      </div>
    </div>
    ${wizardActions('Continuar a requisitos', 'goCallWizardStep(2)')}`;
}
function wizardGuidelines() {
  return html`<p class="wizard-intro">
      Pega directamente las viñetas del brochure. Cada línea se convertirá en un requisito; puedes
      usar •, -, * o escribir una línea por requisito.
    </p>
    <div class="field">
      <label>Requisitos generales</label
      ><textarea
        class="input guidelines-text"
        name="guidelines_text"
        placeholder="• Ser estudiante regular de la UNSAAC&#10;• Encontrarse entre el 5to y 8vo semestre&#10;• No haber realizado una movilidad incompatible"
        required
      >
${esc(callDraft.guidelinesText || callDraft.guidelines.map((item) => `• ${item}`).join('\n'))}</textarea
      ><small class="field-help"
        >Al avanzar se separarán automáticamente en viñetas individuales para la publicación.</small
      >
    </div>
    ${wizardActions('Continuar a documentos', 'goCallWizardStep(3)', 'Volver', 'goCallWizardStep(1)')}`;
}
function wizardDocuments() {
  return html`<p class="wizard-intro">
      Define los archivos que el estudiante deberá presentar. Puedes empezar vacío y añadir solo los
      que corresponden a esta universidad.
    </p>
    <p class="field-help">
      Sugerencias frecuentes: récord académico, carta de motivación, constancia de matrícula,
      pasaporte o carta de nominación.
    </p>
    <div class="wizard-list">
      ${
        callDraft.documents
          .map(
            (item, index) =>
              html`<article class="wizard-entry">
                <div class="entry-number">${String(index + 1).padStart(2, '0')}</div>
                <div class="entry-fields requirement-fields">
                  <div class="field">
                    <label>Documento a presentar</label
                    ><input
                      class="input"
                      name="document_title_${index}"
                      value="${esc(item.title)}"
                      placeholder="Ej. Récord académico"
                      required
                    />
                  </div>
                  <div class="field">
                    <label>Condición</label
                    ><label class="check-label"
                      ><input
                        type="checkbox"
                        name="document_required_${index}"
                        ${item.required ? 'checked' : ''}
                      />
                      Obligatorio</label
                    >
                  </div>
                  <div class="field wide">
                    <label>Indicaciones <span class="muted">(opcional)</span></label
                    ><input
                      class="input"
                      name="document_description_${index}"
                      value="${esc(item.description)}"
                      placeholder="Formato, firma, vigencia o detalle"
                    />
                  </div>
                </div>
                <button class="entry-remove" type="button" onclick="removeDocument(${index})">
                  ×
                </button>
              </article>`,
          )
          .join('') || '<div class="wizard-empty">Aún no agregaste documentos.</div>'
      }
    </div>
    <button type="button" class="btn btn-soft" onclick="addDocument()">＋ Agregar documento</button
    >${wizardActions('Continuar a material OCRI', 'goCallWizardStep(4)', 'Volver', 'goCallWizardStep(2)')}`;
}
function noticeLinks(notice) {
  return (
    notice?.links ||
    (notice?.linkLabel || notice?.linkUrl
      ? [{ label: notice.linkLabel || '', url: notice.linkUrl || '' }]
      : [])
  );
}
function wizardMaterials() {
  const links = noticeLinks(callDraft.notice);
  callDraft.notice.links = links;
  return html`<p class="wizard-intro">
      Adjunta los archivos que OCRI desea compartir con las personas postulantes. La descripción es
      opcional.
    </p>
    <div class="wizard-list">
      ${
        callDraft.resources
          .map(
            (item, index) =>
              html`<article class="wizard-entry">
                <div class="entry-number">${String(index + 1).padStart(2, '0')}</div>
                <div class="entry-fields">
                  <div class="field wide">
                    <label>Adjuntar archivo</label
                    ><input
                      class="input"
                      type="file"
                      name="resource_file_${index}"
                      accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg"
                      onchange="selectCallResource(this, ${index})"
                    /><small class="field-help"
                      >${item.fileName ? `Seleccionado: ${esc(item.fileName)}` : 'PDF, Word, Excel o imagen'}</small
                    >
                  </div>
                  <div class="field wide">
                    <label>Descripción <span class="muted">(opcional)</span></label
                    ><input
                      class="input"
                      name="resource_description_${index}"
                      value="${esc(item.description || '')}"
                      placeholder="Ej. Completa esta ficha antes de solicitar la firma"
                    />
                  </div>
                </div>
                <button class="entry-remove" type="button" onclick="removeResource(${index})">
                  ×
                </button>
              </article>`,
          )
          .join('') || '<div class="wizard-empty">Aún no añadiste materiales de OCRI.</div>'
      }
    </div>
    <button type="button" class="btn btn-soft" onclick="addResource()">＋ Adjuntar material</button>
    <div class="important-box">
      <div class="eyebrow">Importante</div>
      <div class="important-links">
        ${
          links
            .map(
              (link, index) =>
                html`<div class="important-link-row">
                  <div class="field">
                    <label>Texto</label
                    ><input
                      class="input"
                      name="notice_link_label_${index}"
                      value="${esc(link.label)}"
                      placeholder="Ej. Revisa el calendario académico"
                    />
                  </div>
                  <div class="field">
                    <label>URL <span class="muted">(opcional)</span></label
                    ><input
                      class="input"
                      name="notice_link_url_${index}"
                      value="${esc(link.url)}"
                      placeholder="https://…"
                    />
                  </div>
                  <button
                    class="entry-remove"
                    type="button"
                    onclick="removeNoticeLink(${index})"
                    aria-label="Quitar información"
                  >
                    ×
                  </button>
                </div>`,
            )
            .join('') || '<div class="wizard-empty">Aún no agregaste información importante.</div>'
        }
      </div>
      <button type="button" class="btn btn-soft btn-sm" onclick="addNoticeLink()">
        ＋ Añadir información importante
      </button>
    </div>
    ${wizardActions('Revisar convocatoria', 'goCallWizardStep(5)', 'Volver', 'goCallWizardStep(3)')}`;
}
function wizardReview() {
  const deadline = callDraft.end ? shortDate(callDraft.end) : 'Pendiente de completar';
  const checks = [
    [
      'Información general',
      Boolean(callDraft.title && callDraft.end),
      callDraft.title || 'Completa el nombre y la fecha límite.',
    ],
    [
      'Requisitos generales',
      callDraft.guidelines.some(Boolean),
      `${callDraft.guidelines.filter(Boolean).length} requisito(s) informativo(s).`,
    ],
    [
      'Documentos a presentar',
      callDraft.documents.length > 0 && callDraft.documents.every((item) => item.title),
      `${callDraft.documents.length} documento(s) configurado(s).`,
    ],
    [
      'Material OCRI',
      true,
      callDraft.resources.length
        ? `${callDraft.resources.length} material(es) compartido(s).`
        : 'Sin materiales adicionales.',
    ],
  ];
  const ready = checks.slice(0, 3).every((check) => check[1]);
  return html`<p class="wizard-intro">Confirma la información antes de publicar.</p>
    <div class="review-summary">
      <div><span>Convocatoria</span><strong>${esc(callDraft.title || 'Sin título')}</strong></div>
      <div><span>Periodo</span><strong>${callDraft.period}</strong></div>
      <div><span>Fecha límite</span><strong>${deadline}</strong></div>
    </div>
    <div class="review-checks">
      ${checks
        .map(
          (check) =>
            html`<article class="review-check ${check[1] ? 'complete' : 'pending'}">
              <span>${check[1] ? '✓' : '!'}</span>
              <div><strong>${check[0]}</strong><small>${esc(check[2])}</small></div>
            </article>`,
        )
        .join('')}
    </div>
    <div class="publication-note">
      <strong>Resumen final de publicación</strong
      ><span
        >Se publicarán requisitos, documentos solicitados, materiales OCRI e información
        importante.</span
      >
    </div>
    <div class="modal-actions">
      <button type="button" class="btn btn-soft" onclick="goCallWizardStep(4)">Volver</button
      ><button type="button" class="btn btn-soft" onclick="saveCallDraft('BORRADOR')">
        Guardar borrador</button
      ><button
        type="button"
        class="btn btn-primary"
        ${ready ? '' : 'disabled'}
        onclick="saveCallDraft('ACTIVA')"
      >
        Publicar convocatoria
      </button>
    </div>`;
}
function wizardActions(nextLabel, nextAction, backLabel = 'Cancelar', backAction = 'closeModal()') {
  return html`<div class="modal-actions">
    <button type="button" class="btn btn-soft" onclick="${backAction}">${backLabel}</button
    ><button type="button" class="btn btn-primary" onclick="${nextAction}">${nextLabel}</button>
  </div>`;
}
function goCallWizardStep(step) {
  syncCallDraft();
  if (step === 2 && !(callDraft.title && callDraft.end))
    return toast('Completa el nombre y la fecha límite antes de continuar.');
  if (step === 3 && !callDraft.guidelines.some(Boolean))
    return toast('Pega o escribe al menos un requisito general.');
  if (
    step === 4 &&
    (!callDraft.documents.length || callDraft.documents.some((item) => !item.title))
  )
    return toast('Completa al menos un documento a presentar.');
  callWizardStep = step;
  renderCallWizard();
}
function changeCallDirection(direction) {
  syncCallDraft();
  callDraft.direction = direction;
  renderCallWizard();
}
function selectCallCover(input) {
  syncCallDraft();
  const file = input.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    callDraft.coverImage = reader.result;
    callDraft.coverName = file.name;
    callDraft.coverImagePath = '';
    renderCallWizard();
  };
  reader.readAsDataURL(file);
}
function selectCallResource(input, index) {
  syncCallDraft();
  const file = input.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    callDraft.resources[index] = {
      ...callDraft.resources[index],
      dataUrl: reader.result,
      fileName: file.name,
      storagePath: '',
    };
    renderCallWizard();
  };
  reader.readAsDataURL(file);
}
function addDocument() {
  syncCallDraft();
  callDraft.documents.push({ title: '', description: '', required: true });
  renderCallWizard();
}
function removeDocument(index) {
  syncCallDraft();
  callDraft.documents.splice(index, 1);
  renderCallWizard();
}
function addResource() {
  syncCallDraft();
  callDraft.resources.push({ description: '', fileName: '' });
  renderCallWizard();
}
function removeResource(index) {
  syncCallDraft();
  callDraft.resources.splice(index, 1);
  renderCallWizard();
}
function addNoticeLink() {
  syncCallDraft();
  callDraft.notice.links.push({ label: '', url: '' });
  renderCallWizard();
}
function removeNoticeLink(index) {
  syncCallDraft();
  callDraft.notice.links.splice(index, 1);
  renderCallWizard();
}
const storageSafeName = (name) => String(name || 'archivo').replace(/[^a-zA-Z0-9._-]/g, '-');

async function prepareCallAssets() {
  const folder = isUuid(editingCallId) ? editingCallId : crypto.randomUUID();
  if (callDraft.coverImage?.startsWith('data:')) {
    callDraft.coverImagePath = await uploadDataUrl(
      callDraft.coverImage,
      `calls/${folder}/cover-${storageSafeName(callDraft.coverName || 'portada')}`,
    );
  }
  callDraft.resources = await Promise.all(
    callDraft.resources.map(async (resource, index) => {
      if (!resource.dataUrl) return resource;
      const storagePath = await uploadDataUrl(
        resource.dataUrl,
        `calls/${folder}/material-${index + 1}-${storageSafeName(resource.fileName)}`,
      );
      return { ...resource, storagePath, dataUrl: '' };
    }),
  );
}

async function saveCallDraft(status) {
  syncCallDraft();
  const valid =
    callDraft.title &&
    callDraft.end &&
    callDraft.guidelines.some(Boolean) &&
    callDraft.documents.length &&
    callDraft.documents.every((item) => item.title);
  if (status === 'ACTIVA' && !valid) return toast('Aún faltan datos obligatorios para publicar.');
  const edited = isUuid(editingCallId);
  try {
    await prepareCallAssets();
    const payload = {
      ...callDraft,
      id: edited ? editingCallId : null,
      guidelines: callDraft.guidelines.filter(Boolean),
      resources: callDraft.resources.map(({ dataUrl, downloadUrl, ...resource }) => resource),
      status,
    };
    const { error } = await supabase.rpc('admin_upsert_call', { payload });
    if (error) throw error;
    editingCallId = null;
    await loadCallsFromDatabase();
    save();
    closeModal();
    render();
    toast(
      edited
        ? status === 'ACTIVA'
          ? 'Convocatoria actualizada y publicada.'
          : 'Borrador actualizado.'
        : status === 'ACTIVA'
          ? 'Convocatoria publicada.'
          : 'Borrador de convocatoria guardado.',
    );
  } catch (error) {
    toast(`No se pudo guardar la convocatoria: ${error.message}`);
  }
}
function showCallSummary(id) {
  const call = state.calls.find((c) => c.id === id);
  if (!call) return;
  const application = state.applications.find(
    (item) => item.callId === call.id && item.applicantId === session.userId,
  );
  const bullets =
    (call.guidelines || []).map((item) => html`<li>${esc(item)}</li>`).join('') ||
    '<li>Sin requisitos generales.</li>';
  const documents =
    (call.documents || [])
      .map(
        (item) =>
          html`<li>
            <strong>${esc(item.title)}</strong
            ><span
              >${item.required ? 'Obligatorio' : 'Opcional'}${item.description ? ` · ${esc(item.description)}` : ''}</span
            >
          </li>`,
      )
      .join('') || '<li>No hay documentos configurados.</li>';
  const resources =
    (call.resources || [])
      .map(
        (item) =>
          html`<li>
            <strong>${esc(item.fileName || 'Archivo adjunto')}</strong
            >${item.description ? html`<span>${esc(item.description)}</span>` : ''}
            ${
              item.storagePath
                ? html`<button
                    class="btn btn-soft btn-sm"
                    type="button"
                    onclick="downloadCallResource('${call.id}', '${esc(item.storagePath)}')"
                  >
                    Descargar archivo
                  </button>`
                : ''
            }
          </li>`,
      )
      .join('') || '<li>No se proporcionaron materiales adicionales.</li>';
  const links = noticeLinks(call.notice).filter((item) => item.label);
  const notice = links.length
    ? html`<div class="publication-note">
        <strong>Importante</strong>
        <ul class="notice-links">
          ${links.map((link) => html`<li>${link.url ? html`<a href="${esc(link.url)}" target="_blank" rel="noreferrer">${esc(link.label)}</a>` : esc(link.label)}</li>`).join('')}
        </ul>
      </div>`
    : '';
  const adminActions =
    session?.role === 'admin'
      ? html`<button class="btn btn-soft" onclick="editCall('${call.id}')">
            Editar convocatoria
          </button>
          <button class="btn btn-danger" onclick="deleteCall('${call.id}')">
            Eliminar convocatoria
          </button>`
      : '';
  const studentAction =
    session?.role === 'student' && call.direction === 'SALIENTE'
      ? application && application.status !== 'BORRADOR'
        ? html`<button
            class="btn btn-primary"
            onclick="openExistingApplication('${application.id}')"
          >
            Ver mi postulación
          </button>`
        : html`<button class="btn btn-primary" onclick="startApplication('${call.id}')">
            ${application ? 'Continuar postulación' : 'Postular'}
          </button>`
      : '';
  const coverStyle = call.coverImage
    ? ` style="background-image:url('${esc(call.coverImage)}')"`
    : '';
  modal(
    html`<div class="call-detail-hero ${call.coverImage ? 'has-image' : ''}" ${coverStyle}>
        <div class="call-detail-overlay"></div>
        <div class="call-detail-flags">${badge(call.status)}${badge(call.direction)}</div>
        <button class="modal-close call-detail-close" onclick="closeModal()" aria-label="Cerrar">
          ×
        </button>
        <div class="call-detail-title">
          <span>${esc(call.period)} · Límite ${shortDate(call.end)}</span>
          <h2>${esc(call.title)}</h2>
        </div>
      </div>
      <div class="call-detail-content">
        <div class="call-detail-columns">
          <section class="call-detail-section">
            <span class="call-detail-number">01</span>
            <div>
              <h3>Requisitos generales</h3>
              <ul class="summary-list">
                ${bullets}
              </ul>
            </div>
          </section>
          <section class="call-detail-section">
            <span class="call-detail-number">02</span>
            <div>
              <h3>Documentos a presentar</h3>
              <ul class="summary-list">
                ${documents}
              </ul>
            </div>
          </section>
        </div>
        <section class="call-detail-section call-detail-materials">
          <span class="call-detail-number">03</span>
          <div>
            <h3>Material proporcionado por OCRI</h3>
            <ul class="summary-list">
              ${resources}
            </ul>
          </div>
        </section>
        ${notice}
      </div>
      <div class="call-detail-actions">
        ${
          application?.status === 'BORRADOR'
            ? html`<div>
                <strong>Borrador guardado</strong><small>Último avance disponible.</small>
              </div>`
            : '<span></span>'
        }
        <div class="call-detail-buttons">
          ${adminActions}${studentAction}<button class="btn btn-soft" onclick="closeModal()">
            Cerrar
          </button>
        </div>
      </div>`,
    'call-publication-dialog',
  );
}
async function downloadCallResource(callId, storagePath) {
  const call = state.calls.find((item) => item.id === callId);
  const resource = call?.resources?.find((item) => item.storagePath === storagePath);
  if (!resource) return toast('No se encontró el archivo solicitado.');

  const { data, error } = await supabase.storage.from('call-assets').download(storagePath);
  if (error) return toast(`No se pudo descargar el archivo: ${error.message}`);

  const link = document.createElement('a');
  link.href = URL.createObjectURL(data);
  link.download = resource.fileName || 'material-ocri';
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(link.href);
}
async function deleteCall(id) {
  const call = state.calls.find((item) => item.id === id);
  if (!call || session?.role !== 'admin') return;
  if (
    !confirm(
      `¿Eliminar definitivamente la convocatoria “${call.title}”? También se eliminarán sus requisitos, documentos y materiales.`,
    )
  )
    return;

  const assetPaths = [
    call.coverImagePath,
    ...(call.resources || []).map((item) => item.storagePath),
  ].filter(Boolean);
  const { error } = await supabase.rpc('admin_delete_call', { target_call_id: id });
  if (error) return toast(`No se pudo eliminar la convocatoria: ${error.message}`);

  if (assetPaths.length) {
    const { error: storageError } = await supabase.storage.from('call-assets').remove(assetPaths);
    if (storageError)
      console.warn('No se pudieron eliminar algunos archivos:', storageError.message);
  }

  await loadCallsFromDatabase();
  save();
  closeModal();
  render();
  toast('Convocatoria eliminada.');
}
function filterCards(v) {
  document
    .querySelectorAll('.call-card')
    .forEach((e) => e.classList.toggle('hidden', v && e.dataset.direction !== v));
}

// -----------------------------------------------------------------------------
// Postulaciones, nominaciones y gestión documental de demostración
// -----------------------------------------------------------------------------
function detailModal(id) {
  const a = state.applications.find((x) => x.id === id);
  modal(
    html`<div class="modal-head">
        <div>
          <h2>${a.displayId || a.id}</h2>
          <span class="muted">${esc(a.student)}</span>
        </div>
        <button class="modal-close" onclick="closeModal()">×</button>
      </div>
      ${applicationDetail(a)}${
        /admin|reviewer/.test(session.role)
          ? html`<div class="modal-actions">
              <select id="appStatus" class="input">
                <option>EN_REVISION_DOCUMENTAL</option>
                <option>OBSERVADO</option>
                <option>APROBADO_OCRI</option>
                <option>RECHAZADO</option>
                <option>FINALIZADO</option></select
              ><button class="btn btn-primary" onclick="changeAppStatus('${a.id}')">
                Actualizar estado
              </button>
            </div>`
          : ''
      }`,
  );
}
function changeAppStatus(id) {
  const a = state.applications.find((x) => x.id === id),
    s = $('#appStatus').value;
  a.status = s;
  a.history.push([s.replaceAll('_', ' '), new Date().toLocaleDateString('es-PE')]);
  a.progress = s === 'APROBADO_OCRI' ? 100 : a.progress;
  save();
  closeModal();
  render();
  toast('Estado actualizado y registrado');
}
function reviewModal(id, index) {
  const a = state.applications.find((x) => x.id === id),
    d = a.documents[index];
  modal(
    html`<div class="modal-head">
        <h2>Revisar documento</h2>
        <button class="modal-close" onclick="closeModal()">×</button>
      </div>
      <p>
        <strong>${esc(d.name)}</strong><br /><span class="muted">${a.id} · ${esc(a.student)}</span>
      </p>
      <div class="field">
        <label>Resultado</label
        ><select class="input" id="docStatus">
          <option>APROBADO</option>
          <option>OBSERVADO</option>
          <option>RECHAZADO</option>
          <option>EN_REVISION</option>
        </select>
      </div>
      <div class="field" style="margin-top:14px">
        <label>Observación</label
        ><textarea
          class="input"
          id="comment"
          placeholder="Detalle la observación si corresponde"
        ></textarea>
      </div>
      <div class="modal-actions">
        <button class="btn btn-soft" onclick="closeModal()">Cancelar</button
        ><button class="btn btn-primary" onclick="saveReview('${id}',${index})">
          Registrar revisión
        </button>
      </div>`,
  );
}
function saveReview(id, i) {
  const a = state.applications.find((x) => x.id === id),
    s = $('#docStatus').value;
  a.documents[i].status = s;
  a.documents[i].comment = $('#comment').value;
  a.documents[i].reviewedBy = session.name;
  a.documents[i].reviewedAt = new Date().toISOString();
  if (s === 'OBSERVADO') a.status = 'OBSERVADO';
  save();
  closeModal();
  render();
  toast('Revisión guardada con trazabilidad');
}
function nominationModal() {
  modal(
    html`<div class="modal-head">
        <h2>Registrar nominación</h2>
        <button class="modal-close" onclick="closeModal()">×</button>
      </div>
      <form class="form-grid" onsubmit="createNomination(event)">
        <div class="field wide">
          <label>Estudiante</label><input class="input" name="student" required />
        </div>
        <div class="field">
          <label>Universidad de origen</label><input class="input" name="university" required />
        </div>
        <div class="field"><label>País</label><input class="input" name="country" required /></div>
        <div class="field wide">
          <label>Correo institucional</label
          ><input class="input" type="email" name="email" required />
        </div>
        <div class="modal-actions wide">
          <button type="button" class="btn btn-soft" onclick="closeModal()">Cancelar</button
          ><button class="btn btn-primary">Enviar invitación</button>
        </div>
      </form>`,
  );
}
function createNomination(e) {
  e.preventDefault();
  const f = Object.fromEntries(new FormData(e.target));
  state.nominations.unshift({
    id: `NOM-${String(state.nominations.length + 35).padStart(3, '0')}`,
    ...f,
    status: 'INVITACION_ENVIADA',
  });
  save();
  closeModal();
  render();
  toast('Nominación registrada');
}
async function startApplication(callId) {
  closeModal();
  if (!session.photoPath) {
    const { data: currentProfile, error: profileError } = await supabase
      .from('profiles')
      .select('photo_path')
      .eq('user_id', session.userId)
      .single();
    if (profileError || !currentProfile?.photo_path) {
      route = 'profile';
      render();
      return toast('Antes de postular debes registrar tu foto oficial.');
    }
    session.photoPath = currentProfile.photo_path;
  }
  const call = state.calls.find(
    (item) => item.id === callId && item.direction === 'SALIENTE' && item.status === 'ACTIVA',
  );
  if (!call) return toast('La convocatoria ya no está disponible para postular.');

  const existing = state.applications.find(
    (item) => item.callId === callId && item.applicantId === session.userId,
  );
  if (existing && existing.status !== 'BORRADOR') return openExistingApplication(existing.id);

  pendingApplicationFiles.clear();
  applicationDraft = {
    id: existing?.id || '',
    callId,
    callTitle: call.title,
    period: call.period,
    studentCode: existing?.code === 'Pendiente' ? '' : existing?.code || '',
    faculty: existing?.faculty === 'Pendiente' ? '' : existing?.faculty || '',
    academicProgram: existing?.academicProgram || '',
    motivation: existing?.motivation || '',
    currentStep: existing?.currentStep || 1,
    status: existing?.status || 'BORRADOR',
    documents: existing?.documents?.length
      ? structuredClone(existing.documents)
      : (call.documents || []).map((document) => ({
          id: '',
          requirementId: document.requirementId,
          name: document.title,
          required: document.required,
          storagePath: '',
          fileName: '',
          status: 'PENDIENTE',
        })),
  };
  applicationWizardStep = Math.min(existing?.currentStep || 1, 4);
  renderApplicationWizard();
}

function openExistingApplication(applicationId) {
  closeModal();
  const application = state.applications.find((item) => item.id === applicationId);
  if (!application) return toast('No se encontró la postulación.');
  if (application.status === 'BORRADOR') return startApplication(application.callId);
  detailModal(applicationId);
}

function syncApplicationDraft() {
  const form = $('#applicationWizardForm');
  if (!form || !applicationDraft) return;
  const data = new FormData(form);
  if (form.elements.namedItem('studentCode'))
    applicationDraft.studentCode = String(data.get('studentCode') || '').trim();
  if (form.elements.namedItem('faculty'))
    applicationDraft.faculty = String(data.get('faculty') || '').trim();
  if (form.elements.namedItem('academicProgram'))
    applicationDraft.academicProgram = String(data.get('academicProgram') || '').trim();
  if (form.elements.namedItem('motivation'))
    applicationDraft.motivation = String(data.get('motivation') || '').trim();
}

function applicationNavigation() {
  const steps = ['Datos académicos', 'Presentación', 'Documentos', 'Revisión'];
  return html`<aside class="wizard-route application-route">
    <div class="eyebrow">Ruta de postulación</div>
    <h3>${esc(applicationDraft.callTitle)}</h3>
    ${steps.map((label, index) => html`<button type="button" class="${applicationWizardStep === index + 1 ? 'active' : ''} ${applicationDraft.currentStep > index + 1 ? 'done' : ''}" onclick="goApplicationWizardStep(${index + 1})"><span>0${index + 1}</span>${label}</button>`).join('')}
    <div class="application-draft-note">
      <strong>Borrador privado</strong>
      <span>Tu avance se guarda en tu cuenta y puedes continuar después.</span>
    </div>
  </aside>`;
}

function renderApplicationWizard() {
  const content = [
    applicationAcademicStep,
    applicationPresentationStep,
    applicationDocumentsStep,
    applicationReviewStep,
  ][applicationWizardStep - 1]();
  const titles = [
    '01 · Datos académicos',
    '02 · Presentación y motivación',
    '03 · Documentos solicitados',
    '04 · Revisión y envío',
  ];
  const body = html`<div class="wizard-shell">
    <header class="wizard-header">
      <div class="wizard-header-start">
        <strong>SIGMA</strong>
        <span>OFICINA DE COOPERACIÓN Y RELACIONES INTERNACIONALES</span>
      </div>
      <div class="wizard-header-end">
        <span>${esc(applicationDraft.period)} · Mi postulación</span>
        <i aria-label="Escudo UNSAAC"></i>
      </div>
    </header>
    <div class="wizard-layout">
      ${applicationNavigation()}
      <section class="wizard-main application-main">
        <div class="modal-head">
          <div>
            <div class="eyebrow">SGMS / ${esc(applicationDraft.callTitle)}</div>
            <h2>${titles[applicationWizardStep - 1]}</h2>
          </div>
          <button class="wizard-exit" onclick="saveApplicationDraftAndExit()">
            Guardar y salir
          </button>
        </div>
        <form id="applicationWizardForm" onsubmit="return false">${content}</form>
      </section>
    </div>
  </div>`;
  const existing = $('#modal .modal');
  if (existing) {
    existing.className = 'modal application-wizard';
    existing.innerHTML = body;
  } else modal(body, 'application-wizard');
}

function applicationAcademicStep() {
  return html`<div class="application-profile-strip">
      <span class="sidebar-avatar">
        ${session.photoUrl ? html`<img src="${esc(session.photoUrl)}" alt="" />` : esc(session.initials)}
      </span>
      <div><strong>${esc(session.name)}</strong><small>${esc(session.email)}</small></div>
      <span class="application-photo-ok">✓ Foto registrada</span>
    </div>
    <div class="form-grid application-form-grid">
      <div class="field">
        <label>Código de estudiante</label
        ><input
          class="input"
          name="studentCode"
          value="${esc(applicationDraft.studentCode)}"
          placeholder="Ej. 200123"
          required
        />
      </div>
      <div class="field">
        <label>Facultad</label
        ><input
          class="input"
          name="faculty"
          value="${esc(applicationDraft.faculty)}"
          placeholder="Ej. Ingeniería"
          required
        />
      </div>
      <div class="field wide">
        <label>Escuela profesional</label
        ><input
          class="input"
          name="academicProgram"
          value="${esc(applicationDraft.academicProgram)}"
          placeholder="Ej. Ingeniería Informática y de Sistemas"
          required
        />
      </div>
    </div>
    ${applicationWizardActions('Continuar a presentación', 2)}`;
}

function applicationPresentationStep() {
  return html`<div class="presentation-prompt">
      <span>Orientación</span>
      <p>Resume tus objetivos académicos y el aporte del intercambio para tu carrera.</p>
    </div>
    <div class="field">
      <label>Presentación y motivación</label
      ><textarea
        class="input application-motivation"
        name="motivation"
        maxlength="2500"
        placeholder="Escribe tu presentación…"
        required
      >
${esc(applicationDraft.motivation)}</textarea
      ><small class="field-help">Máximo 2500 caracteres.</small>
    </div>
    ${applicationWizardActions('Continuar a documentos', 3, 'Volver', 1)}`;
}

function applicationDocumentsStep() {
  const documents = applicationDraft.documents || [];
  return html`<p class="wizard-intro">Adjunta los documentos solicitados por OCRI.</p>
    <div class="application-document-list">
      ${
        documents.length
          ? documents
              .map((document, index) => {
                const pendingFile = pendingApplicationFiles.get(document.requirementId);
                const fileName = pendingFile?.name || document.fileName;
                return html`<article class="application-document ${fileName ? 'is-ready' : ''}">
                  <div class="application-document-icon">
                    ${fileName ? '✓' : String(index + 1).padStart(2, '0')}
                  </div>
                  <div class="application-document-copy">
                    <strong>${esc(document.name)}</strong>
                    <small
                      >${document.required ? 'Obligatorio' : 'Opcional'}${fileName ? ` · ${esc(fileName)}` : ' · Pendiente de adjuntar'}</small
                    >
                  </div>
                  <label class="btn btn-soft btn-sm application-upload-button">
                    ${fileName ? 'Reemplazar' : 'Adjuntar'}
                    <input
                      type="file"
                      accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
                      onchange="selectApplicationDocument(this, '${document.requirementId}')"
                    />
                  </label>
                </article>`;
              })
              .join('')
          : '<div class="wizard-empty">Esta convocatoria no solicita documentos.</div>'
      }
    </div>
    <p class="application-security-note">
      🔒 Los archivos son privados y solo podrán verlos tú y el personal autorizado de OCRI.
    </p>
    ${applicationWizardActions('Revisar postulación', 4, 'Volver', 2)}`;
}

function applicationReviewStep() {
  const requiredDocuments = applicationDraft.documents.filter((document) => document.required);
  const completedRequired = requiredDocuments.filter(
    (document) => document.storagePath || pendingApplicationFiles.has(document.requirementId),
  ).length;
  const academicComplete = Boolean(
    applicationDraft.studentCode && applicationDraft.faculty && applicationDraft.academicProgram,
  );
  const presentationComplete = Boolean(applicationDraft.motivation);
  const documentsComplete = completedRequired === requiredDocuments.length;
  const complete = academicComplete && presentationComplete && documentsComplete;
  return html`<p class="wizard-intro">Verifica tu expediente antes de enviarlo a OCRI.</p>
    <div class="application-review-grid">
      <article class="application-review-card ${academicComplete ? 'complete' : ''}">
        <span>${academicComplete ? '✓' : '!'}</span>
        <div>
          <strong>Datos académicos</strong
          ><small
            >${academicComplete ? `${esc(applicationDraft.academicProgram)} · ${esc(applicationDraft.faculty)}` : 'Faltan datos por completar.'}</small
          >
        </div>
      </article>
      <article class="application-review-card ${presentationComplete ? 'complete' : ''}">
        <span>${presentationComplete ? '✓' : '!'}</span>
        <div>
          <strong>Presentación</strong
          ><small
            >${presentationComplete ? 'Texto de motivación registrado.' : 'Falta escribir tu presentación.'}</small
          >
        </div>
      </article>
      <article class="application-review-card ${documentsComplete ? 'complete' : ''}">
        <span>${documentsComplete ? '✓' : '!'}</span>
        <div>
          <strong>Documentos</strong
          ><small>${completedRequired} de ${requiredDocuments.length} obligatorios adjuntos.</small>
        </div>
      </article>
    </div>
    <div class="application-submit-panel">
      <div>
        <strong
          >${complete ? 'Tu postulación está lista' : 'Tu borrador todavía está incompleto'}</strong
        >
        <p>
          ${complete ? 'Al enviar, OCRI recibirá el expediente para revisión.' : 'Puedes guardarlo ahora y continuar en otro momento.'}
        </p>
      </div>
      <button
        class="btn btn-primary"
        type="button"
        onclick="submitStudentApplication()"
        ${complete ? '' : 'disabled'}
      >
        Enviar postulación
      </button>
    </div>
    ${applicationWizardActions('', 0, 'Volver', 3)}`;
}

function applicationWizardActions(nextLabel, nextStep, backLabel = 'Volver', backStep = 0) {
  return html`<div class="modal-actions application-wizard-actions">
    <button class="btn btn-soft" type="button" onclick="saveApplicationDraftAndExit()">
      Guardar y continuar después
    </button>
    <span></span>
    ${backStep ? html`<button class="btn btn-soft" type="button" onclick="goApplicationWizardStep(${backStep})">${backLabel}</button>` : ''}
    ${nextStep ? html`<button class="btn btn-primary" type="button" onclick="goApplicationWizardStep(${nextStep})">${nextLabel}</button>` : ''}
  </div>`;
}

async function goApplicationWizardStep(step) {
  syncApplicationDraft();
  if (step > applicationWizardStep) {
    if (
      applicationWizardStep === 1 &&
      (!applicationDraft.studentCode ||
        !applicationDraft.faculty ||
        !applicationDraft.academicProgram)
    )
      return toast('Completa los datos académicos para continuar.');
    if (applicationWizardStep === 2 && !applicationDraft.motivation)
      return toast('Escribe tu presentación para continuar.');
  }
  const saved = await persistApplicationDraft(Math.max(applicationDraft.currentStep, step));
  if (!saved) return;
  applicationWizardStep = step;
  renderApplicationWizard();
}

function selectApplicationDocument(input, requirementId) {
  const file = input.files?.[0];
  if (!file) return;
  const validTypes = [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'image/png',
    'image/jpeg',
  ];
  if (!validTypes.includes(file.type)) {
    input.value = '';
    return toast('Adjunta un archivo PDF, Word, PNG o JPG.');
  }
  if (file.size > 10 * 1024 * 1024) {
    input.value = '';
    return toast('Cada documento puede pesar como máximo 10 MB.');
  }
  pendingApplicationFiles.set(requirementId, file);
  renderApplicationWizard();
}

async function persistApplicationDraft(currentStep = applicationWizardStep) {
  syncApplicationDraft();
  const { data: applicationId, error } = await supabase.rpc('student_save_application_draft', {
    payload: {
      callId: applicationDraft.callId,
      studentCode: applicationDraft.studentCode,
      faculty: applicationDraft.faculty,
      academicProgram: applicationDraft.academicProgram,
      motivation: applicationDraft.motivation,
      currentStep,
    },
  });
  if (error) {
    toast(`No se pudo guardar el borrador: ${error.message}`);
    return false;
  }

  for (const [requirementId, file] of pendingApplicationFiles) {
    const path = `${session.userId}/${applicationId}/${requirementId}-${storageSafeName(file.name)}`;
    const previousDocument = applicationDraft.documents.find(
      (document) => document.requirementId === requirementId,
    );
    const { error: uploadError } = await supabase.storage
      .from('application-documents')
      .upload(path, file, { upsert: true, contentType: file.type });
    if (uploadError) {
      toast(`No se pudo subir ${file.name}: ${uploadError.message}`);
      return false;
    }
    const { error: documentError } = await supabase
      .from('application_documents')
      .update({ storage_path: path, file_name: file.name, status: 'SUBIDO' })
      .eq('application_id', applicationId)
      .eq('requirement_id', requirementId);
    if (documentError) {
      await supabase.storage.from('application-documents').remove([path]);
      toast(`No se pudo registrar ${file.name}: ${documentError.message}`);
      return false;
    }
    if (previousDocument?.storagePath && previousDocument.storagePath !== path)
      await supabase.storage.from('application-documents').remove([previousDocument.storagePath]);
  }
  pendingApplicationFiles.clear();
  await loadApplicationsFromDatabase();
  const saved = state.applications.find((item) => item.id === applicationId);
  if (saved) {
    applicationDraft.id = saved.id;
    applicationDraft.currentStep = saved.currentStep;
    applicationDraft.documents = structuredClone(saved.documents);
  }
  return true;
}

async function saveApplicationDraftAndExit() {
  const saved = await persistApplicationDraft(applicationWizardStep);
  if (!saved) return;
  closeModal();
  render();
  toast('Borrador guardado. Puedes continuar cuando quieras.');
}

async function submitStudentApplication() {
  syncApplicationDraft();
  const saved = await persistApplicationDraft(4);
  if (!saved) return;
  const { error } = await supabase.rpc('student_submit_application', {
    target_application_id: applicationDraft.id,
  });
  if (error) return toast(`No se pudo enviar la postulación: ${error.message}`);
  await loadApplicationsFromDatabase();
  closeModal();
  route = 'sgms';
  render();
  toast('Postulación enviada correctamente a OCRI.');
}
function exportCSV() {
  const rows = [
    ['Expediente', 'Dirección', 'Estudiante', 'Facultad', 'Universidad', 'Estado', 'Fecha'],
    ...state.applications.map((a) => [
      a.id,
      a.direction,
      a.student,
      a.faculty,
      a.destination,
      a.status,
      a.submitted,
    ]),
  ];
  const csv =
    '\ufeff' +
    rows.map((r) => r.map((v) => `"${String(v).replaceAll('"', '""')}"`).join(',')).join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  a.download = 'reporte-sigma.csv';
  a.click();
  URL.revokeObjectURL(a.href);
  toast('Reporte CSV generado');
}
function universityModal() {
  modal(
    html`<div class="modal-head">
        <h2>Registrar universidad externa</h2>
        <button class="modal-close" onclick="closeModal()">×</button>
      </div>
      <p class="muted">Ingrese el dominio oficial sin @; por ejemplo, universidad.edu.</p>
      <form class="form-grid" onsubmit="createUniversity(event)">
        <div class="field wide">
          <label>Nombre de la universidad</label><input class="input" name="name" required />
        </div>
        <div class="field"><label>País</label><input class="input" name="country" required /></div>
        <div class="field">
          <label>Dominio institucional</label
          ><input class="input" name="domain" placeholder="universidad.edu" required />
        </div>
        <div class="modal-actions wide">
          <button type="button" class="btn btn-soft" onclick="closeModal()">Cancelar</button
          ><button class="btn btn-primary">Aprobar y registrar</button>
        </div>
      </form>`,
  );
}
async function createUniversity(event) {
  event.preventDefault();
  const f = Object.fromEntries(new FormData(event.target));
  const { error } = await supabase.rpc('admin_create_university_with_domain', {
    university_name: f.name,
    university_country: f.country,
    institutional_domain: f.domain,
  });
  if (error) return toast(error.message);
  closeModal();
  toast('Universidad y dominio aprobados.');
  views.access();
}
async function designateExternalManager(event) {
  event.preventDefault();
  const f = Object.fromEntries(new FormData(event.target)),
    person = accessProfiles.find((p) => p.email.toLowerCase() === f.email.trim().toLowerCase());
  if (!person) return toast('No existe una cuenta registrada con ese correo.');
  if (
    !person.universities ||
    person.universities.name === 'Universidad Nacional de San Antonio Abad del Cusco'
  )
    return toast('La persona debe pertenecer a una universidad externa aprobada.');
  const { error } = await supabase.rpc('admin_set_user_role', {
    target_user_id: person.user_id,
    target_role_code: 'GESTOR_EXTERNO',
  });
  if (error) return toast(error.message);
  toast('Gestor externo designado.');
  views.access();
}

// -----------------------------------------------------------------------------
// Inicio de la aplicación y funciones invocadas desde los eventos HTML
// -----------------------------------------------------------------------------
// Punto de entrada: restaura sesiones y reacciona a login, recuperación y cierre de sesión.
async function boot() {
  if (!supabase) return login();
  const {
    data: { session: authSession },
  } = await supabase.auth.getSession();
  if (authSession) await loadSession(authSession.user);
  else login();
  supabase.auth.onAuthStateChange(async (event, nextSession) => {
    if (event === 'PASSWORD_RECOVERY') passwordRecoveryMode = true;
    if ((event === 'SIGNED_IN' || event === 'PASSWORD_RECOVERY') && nextSession)
      await loadSession(nextSession.user);
    if (event === 'SIGNED_OUT') login();
  });
}
Object.assign(window, {
  $,
  signIn,
  requestPasswordReset,
  showRegister,
  register,
  setPassword,
  signOut,
  go,
  callModal,
  editCall,
  goCallWizardStep,
  changeCallDirection,
  selectCallCover,
  selectCallResource,
  addDocument,
  removeDocument,
  addResource,
  removeResource,
  addNoticeLink,
  removeNoticeLink,
  saveCallDraft,
  showCallSummary,
  downloadCallResource,
  deleteCall,
  filterCards,
  detailModal,
  changeAppStatus,
  reviewModal,
  saveReview,
  saveProfile,
  selectProfilePhoto,
  previewProfilePhoto,
  viewProfilePhoto,
  updateProfilePhotoFromPreview,
  nominationModal,
  createNomination,
  startApplication,
  openExistingApplication,
  goApplicationWizardStep,
  selectApplicationDocument,
  saveApplicationDraftAndExit,
  submitStudentApplication,
  exportCSV,
  closeModal,
  universityModal,
  createUniversity,
  designateExternalManager,
});
boot();
