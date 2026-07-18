// ==========================================
// ProxyFleet ERP - V7 Trazabilidad Total
// ==========================================

const META_PUNTOS = 50;
let bd = { cuentas: [], poolNodos: [], listaNegra: [] };
let cuentaTempPuntos = null;
let cuentaSeleccionadaParaAsignar = null;
let nodoSeleccionadoParaAsignar = null;
let esModoEdicionIP = false;

let chartCuentas, chartProveedores, chartFinanciero;

window.onload = () => {
    if(localStorage.getItem('theme') === 'light') document.documentElement.classList.remove('dark');
    else document.documentElement.classList.add('dark');

    try {
        const datos = localStorage.getItem('proxyFleetBD');
        if (datos) {
            bd = JSON.parse(datos);
            // Migración Estructural V7
            bd.cuentas.forEach(c => {
                if(!c.inicio_ciclo) c.inicio_ciclo = new Date().toISOString();
                if(!c.ultimo_cobro) c.ultimo_cobro = null;
                if(!c.historial_retiros) c.historial_retiros = [];
                // Nuevas variables Trazabilidad
                if(!c.fecha_creacion) c.fecha_creacion = new Date().toISOString().split('T')[0];
                if(!c.logs) c.logs = [];
                if(typeof c.cambios_nodo === 'undefined') c.cambios_nodo = 0;
                if(typeof c.cambios_ip === 'undefined') c.cambios_ip = 0;
            });
        }
    } catch (e) { console.error("Error BD"); }
    
    document.getElementById('config-ipinfo-key').value = localStorage.getItem('ipinfoKey') || '';

    actualizarEstadisticas();
    renderizarCuentas();
    dibujarGraficosBase();
};

function toggleTheme() {
    document.documentElement.classList.toggle('dark');
    localStorage.setItem('theme', document.documentElement.classList.contains('dark') ? 'dark' : 'light');
    dibujarGraficosBase();
    if(!document.getElementById('vista-finanzas').classList.contains('hidden')) dibujarGraficoFinanciero();
}

// --- AJUSTES Y RESET ---
function abrirConfiguracion() { document.getElementById('modal-config').classList.remove('hidden'); }
function guardarConfiguracion() {
    localStorage.setItem('ipinfoKey', document.getElementById('config-ipinfo-key').value.trim());
    document.getElementById('modal-config').classList.add('hidden');
    alert("✅ Ajustes guardados localmente.");
}
function borrarTodoSistema() {
    if(!confirm("⚠️ ADVERTENCIA CRÍTICA ⚠️\n¿Estás absolutamente seguro de querer borrar TODO?")) return;
    localStorage.removeItem('proxyFleetBD'); location.reload();
}
function guardarBD() {
    localStorage.setItem('proxyFleetBD', JSON.stringify(bd));
    actualizarEstadisticas(); dibujarGraficosBase();
    if(!document.getElementById('vista-finanzas').classList.contains('hidden')) dibujarGraficoFinanciero();
}

// --- UTILIDADES GLOBALES ---
function truncarNodo(str) { return str ? str.substring(0, 14).toLowerCase() : ""; }
function formatoCalidad(num) { return parseFloat(num || 0).toFixed(1); }
function calcularDias(fecha) { return fecha ? Math.floor(Math.abs(Date.now() - new Date(fecha).getTime()) / (1000 * 60 * 60 * 24)) : 0; }
function formatoFechaCorta(iso) { return iso ? new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }) : 'Nunca'; }
function formatoFechaCompleta(iso) { return iso ? new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' }) + ' ' + new Date(iso).toLocaleTimeString('es-ES', {hour: '2-digit', minute:'2-digit'}) : ''; }
function copiarTexto(texto) {
    if(!texto || texto === '-') return;
    navigator.clipboard.writeText(texto).then(() => {
        const t = document.getElementById('toast'); document.getElementById('toast-msg').innerText = `Copiado: ${texto}`;
        t.classList.remove('hide-toast'); setTimeout(() => t.classList.add('hide-toast'), 2500);
    }).catch(() => alert("Copiado manual: " + texto));
}

// --- LOGS DE AUDITORÍA (CAJA NEGRA) ---
function agregarLog(idCuenta, msj) {
    const c = bd.cuentas.find(x => x.id === idCuenta);
    if(c) c.logs.unshift({ fecha: new Date().toISOString(), msj: msj });
}

function abrirModalAuditoria(id) {
    const c = bd.cuentas.find(x => x.id === id);
    document.getElementById('audit-cuenta').innerText = id;
    document.getElementById('audit-fecha').innerText = c.fecha_creacion;
    document.getElementById('audit-cambios-nodo').innerText = c.cambios_nodo || 0;
    document.getElementById('audit-cambios-ip').innerText = c.cambios_ip || 0;

    const cont = document.getElementById('lista-logs');
    cont.innerHTML = '';
    if(!c.logs || c.logs.length === 0) {
        cont.innerHTML = '<div class="text-center text-gray-500 py-4 italic text-sm">Sin registros de actividad.</div>';
    } else {
        c.logs.forEach(l => {
            cont.innerHTML += `
                <div class="bg-white dark:bg-gray-800 p-3 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm flex flex-col mb-2">
                    <span class="text-xs text-blue-500 font-bold mb-1"><i class="fa-regular fa-clock"></i> ${formatoFechaCompleta(l.fecha)}</span>
                    <span class="text-sm font-medium text-gray-800 dark:text-gray-200">${l.msj}</span>
                </div>
            `;
        });
    }
    document.getElementById('modal-auditoria').classList.remove('hidden');
}

// --- GRÁFICOS ---
function dibujarGraficosBase() {
    const ctx1 = document.getElementById('graficoEstadoCuentas'), ctx2 = document.getElementById('graficoProveedores');
    if(!ctx1 || !ctx2) return;
    const con = bd.cuentas.filter(c => c.nodo && c.ip).length, vac = bd.cuentas.length - con;
    const pMys = bd.cuentas.filter(c => c.proveedor === 'MYSTERIUM').length, pInd = bd.cuentas.filter(c => c.proveedor === 'INDETECTABLE').length;
    Chart.defaults.color = document.documentElement.classList.contains('dark') ? '#9CA3AF' : '#6B7280';
    
    if(chartCuentas) chartCuentas.destroy();
    chartCuentas = new Chart(ctx1, { type: 'doughnut', data: { labels: ['Conectadas', 'Vacías'], datasets: [{ data: [con, vac], backgroundColor: ['#3B82F6', '#EF4444'], borderWidth: 0 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' }, title: { display: true, text: 'Salud de Infraestructura' } }, cutout: '75%' } });
    if(chartProveedores) chartProveedores.destroy();
    chartProveedores = new Chart(ctx2, { type: 'pie', data: { labels: ['Mysterium', 'Indetectable'], datasets: [{ data: [pMys, pInd], backgroundColor: ['#8B5CF6', '#10B981'], borderWidth: 0 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' }, title: { display: true, text: 'Proveedores Activos' } } } });
}
function dibujarGraficoFinanciero() {
    const ctx = document.getElementById('graficoFinanciero'); if(!ctx) return;
    const cobros = {};
    bd.cuentas.forEach(c => c.historial_retiros.forEach(ret => {
        const m = new Date(ret.fecha).toLocaleDateString('es-ES', { month: 'short', year: 'numeric' });
        cobros[m] = (cobros[m] || 0) + 1;
    }));
    const lbl = Object.keys(cobros), dta = Object.values(cobros);
    if(chartFinanciero) chartFinanciero.destroy();
    chartFinanciero = new Chart(ctx, { type: 'bar', data: { labels: lbl.length ? lbl : ['-'], datasets: [{ label: 'Retiros', data: dta.length ? dta : [0], backgroundColor: '#22C55E', borderRadius: 6 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, title: { display: true, text: 'Proyección Pagos' } } } });
}

// --- NAVEGACIÓN ---
function cambiarVista(v) {
    ['dashboard', 'finanzas', 'pool', 'blacklist'].forEach(id => document.getElementById(`vista-${id}`).classList.add('hidden'));
    document.querySelectorAll('#menu-nav button').forEach(btn => { btn.classList.remove('bg-blue-500', 'text-white', 'shadow-md'); btn.classList.add('text-gray-600', 'dark:text-gray-300', 'hover:bg-gray-100', 'dark:hover:bg-gray-700'); });
    document.getElementById(`vista-${v}`).classList.remove('hidden');
    const b = document.querySelector(`button[data-vista="${v}"]`);
    if(b) { b.classList.remove('text-gray-600', 'dark:text-gray-300', 'hover:bg-gray-100', 'dark:hover:bg-gray-700'); b.classList.add('bg-blue-500', 'text-white', 'shadow-md'); }
    const titulos = { dashboard: "Infraestructura", finanzas: "Ciclos de Vida y Finanzas", pool: "Pool Mysterium", blacklist: "Cuarentena Global" };
    document.getElementById('titulo-vista').innerText = titulos[v];
    if (v === 'dashboard') renderizarCuentas();
    if (v === 'finanzas') { renderizarFinanzas(); dibujarGraficoFinanciero(); }
    if (v === 'pool') renderizarPool();
    if (v === 'blacklist') renderizarBlacklist();
}
function actualizarEstadisticas() {
    document.getElementById('stat-activas').innerText = bd.cuentas.length;
    let r = 0; bd.cuentas.forEach(c => r += c.historial_retiros.length);
    document.getElementById('stat-retiros').innerText = r;
    if(document.getElementById('count-blacklist')) document.getElementById('count-blacklist').innerText = bd.listaNegra.length;
}

// --- 1. INFRAESTRUCTURA Y CREACIÓN CUSTOM ---
function abrirModalCrearCuenta() {
    // Poner fecha de hoy por defecto en el input
    document.getElementById('nueva-cuenta-fecha').value = new Date().toISOString().split('T')[0];
    document.getElementById('nueva-cuenta-id').value = '';
    document.getElementById('modal-crear-cuenta').classList.remove('hidden');
    setTimeout(() => document.getElementById('nueva-cuenta-id').focus(), 100);
}
function cerrarModalCrearCuenta() { document.getElementById('modal-crear-cuenta').classList.add('hidden'); }

function confirmarCrearCuenta() {
    const id = document.getElementById('nueva-cuenta-id').value.trim().toUpperCase();
    const fecha = document.getElementById('nueva-cuenta-fecha').value;
    
    if(!id) return alert("Falta el ID.");
    if(!fecha) return alert("Selecciona la fecha original.");
    if(bd.cuentas.find(c => c.id === id)) return alert("Cuenta ya existe.");
    
    bd.cuentas.push({ 
        id: id, nodo: null, ip: null, proveedor: 'MYSTERIUM', score: '', puntos_actuales: 0, 
        historial_retiros: [], inicio_ciclo: new Date().toISOString(), ultimo_cobro: null,
        fecha_creacion: fecha, logs: [], cambios_nodo: 0, cambios_ip: 0 
    });
    
    agregarLog(id, `Cuenta Registrada. Fecha origen: ${fecha}`);
    guardarBD(); cerrarModalCrearCuenta(); renderizarCuentas();
}

function renombrarCuenta(idActual) {
    const c = bd.cuentas.find(x => x.id === idActual);
    const nuevoId = prompt(`Nuevo nombre para ${idActual}:`, idActual);
    if (!nuevoId || nuevoId.trim().toUpperCase() === idActual.toUpperCase()) return;
    if (bd.cuentas.find(x => x.id === nuevoId.trim().toUpperCase())) return alert("En uso.");
    agregarLog(idActual, `Renombrada de ${idActual} a ${nuevoId.trim().toUpperCase()}`);
    c.id = nuevoId.trim().toUpperCase();
    guardarBD(); renderizarCuentas();
}

function eliminarCuenta(id) {
    if(!confirm(`⚠️ PELIGRO: ¿ELIMINAR cuenta ${id} y perder todo su historial?`)) return;
    const c = bd.cuentas.find(x => x.id === id);
    if(c.nodo || c.ip) {
        if(confirm(`¿Enviar nodo ${c.nodo||''} y la IP a CUARENTENA antes de borrar?`)) {
            if(c.nodo) bd.listaNegra.push(c.nodo); if(c.ip) bd.listaNegra.push(c.ip);
            bd.listaNegra = [...new Set(bd.listaNegra)];
        }
    }
    bd.cuentas = bd.cuentas.filter(x => x.id !== id); guardarBD(); renderizarCuentas();
}

function actualizarCampo(id, campo, val) { const c = bd.cuentas.find(x => x.id === id); if(c) { c[campo] = val; guardarBD(); } }

function renderizarCuentas() {
    const tbody = document.getElementById('tabla-cuentas');
    const f = document.getElementById('buscar-cuenta').value.toUpperCase();
    tbody.innerHTML = '';
    
    bd.cuentas.filter(c => c.id.includes(f)).forEach(c => {
        const ok = c.nodo && c.ip;
        const tr = document.createElement('tr'); tr.className = "hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors";
        tr.innerHTML = `
            <td class="px-6 py-4 font-black text-lg text-gray-900 dark:text-white group flex items-center">
                <button onclick="abrirModalAuditoria('${c.id}')" class="text-blue-500 hover:text-blue-700 mr-2" title="Auditoría / Logs"><i class="fa-solid fa-circle-info"></i></button>
                ${c.id}
                <button onclick="renombrarCuenta('${c.id}')" class="opacity-0 group-hover:opacity-100 ml-3 text-gray-400 hover:text-blue-500 text-sm transition-opacity" title="Renombrar"><i class="fa-solid fa-pen"></i></button>
            </td>
            <td class="px-6 py-4 font-mono text-base font-bold ${ok ? 'text-blue-500' : 'text-gray-400'}">${c.nodo || '-'} ${ok ? `<button onclick="copiarTexto('${c.nodo}')" class="ml-2 text-gray-400 hover:text-blue-500"><i class="fa-solid fa-copy"></i></button>` : ''}</td>
            <td class="px-6 py-4 font-mono text-base font-bold ${ok ? 'text-gray-800 dark:text-gray-200' : 'text-gray-400'}">${c.ip || '-'} ${ok ? `<button onclick="abrirEdicionIP('${c.id}')" class="ml-2 text-gray-400 hover:text-green-500" title="Editar IP"><i class="fa-solid fa-pen"></i></button>` : ''}</td>
            <td class="px-6 py-4">
                <select onchange="actualizarCampo('${c.id}', 'proveedor', this.value)" class="bg-gray-100 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 text-sm rounded-lg px-2 py-1 font-bold focus:ring-2 focus:ring-blue-500 outline-none">
                    <option value="MYSTERIUM" ${c.proveedor === 'MYSTERIUM' ? 'selected' : ''}>MYSTERIUM</option>
                    <option value="INDETECTABLE" ${c.proveedor === 'INDETECTABLE' ? 'selected' : ''}>INDETECTABLE</option>
                </select>
            </td>
            <td class="px-6 py-4"><input type="number" onchange="actualizarCampo('${c.id}', 'score', this.value)" value="${c.score}" placeholder="Pts" class="w-20 bg-gray-100 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 text-center text-sm rounded-lg px-2 py-1 font-bold focus:ring-2 focus:ring-red-500 outline-none text-red-500"></td>
            <td class="px-6 py-4 text-right space-x-3 flex justify-end items-center">
                ${ok ? `<button onclick="quemarNodo('${c.id}')" class="text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 p-2 rounded-lg" title="Quemar Nodo"><i class="fa-solid fa-fire text-lg"></i></button>` : ``}
                <button onclick="eliminarCuenta('${c.id}')" class="text-gray-400 hover:text-red-600 p-2 rounded-lg" title="Eliminar"><i class="fa-solid fa-trash-can text-lg"></i></button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function abrirEdicionIP(id) {
    esModoEdicionIP = true; cuentaSeleccionadaParaAsignar = id;
    const c = bd.cuentas.find(x => x.id === id);
    document.getElementById('modal-cuenta-nombre').innerText = id;
    document.getElementById('modal-ip-input').value = c.ip;
    document.getElementById('caja-nodo-modal').classList.add('hidden');
    document.getElementById('api-resultados').classList.add('hidden');
    document.getElementById('modal-asignar').classList.remove('hidden');
}

function cerrarModalAsignar() {
    document.getElementById('modal-asignar').classList.add('hidden');
    document.getElementById('api-resultados').classList.add('hidden');
}

// --- INTELIGENCIA IPINFO (DATA COMPLETA / CRUDO) ---
async function consultarIPInfoCrudo() {
    const ip = document.getElementById('modal-ip-input').value.trim();
    if(!ip) return alert("Ingresa IP.");
    let token = localStorage.getItem('ipinfoKey') || "8c97cc52a98a48";

    const panel = document.getElementById('api-resultados');
    const datos = document.getElementById('api-datos');
    panel.classList.remove('hidden');
    datos.innerHTML = '<div class="text-gray-500 p-4"><i class="fa-solid fa-spinner fa-spin mr-2"></i> Extrayendo JSON completo...</div>';

    try {
        const res = await fetch(`https://ipinfo.io/${ip}?token=${token}`);
        const d = await res.json();
        
        if(d.error) { datos.innerHTML = `<span class="text-red-500 p-4">Error API.</span>`; return; }

        let htmlExtra = '';
        for (const [key, value] of Object.entries(d)) {
            if(key !== 'readme' && typeof value !== 'object') {
                htmlExtra += `<div class="bg-gray-100 dark:bg-gray-800 p-2 rounded border border-gray-300 dark:border-gray-700">
                    <span class="text-blue-500 dark:text-blue-400 text-[10px] uppercase font-bold tracking-widest">${key}</span><br>
                    <strong class="text-gray-900 dark:text-white text-sm break-all font-mono">${value}</strong>
                </div>`;
            }
        }
        
        const isDc = (d.org||"").toLowerCase().match(/hosting|datacenter|cloud|amazon|google|digitalocean/);
        
        datos.innerHTML = `
            <div class="mb-3 p-3 rounded-lg font-bold text-sm text-center ${isDc ? 'bg-red-100 dark:bg-red-900/30 text-red-600' : 'bg-green-100 dark:bg-green-900/30 text-green-600'}">
                ${isDc ? '<i class="fa-solid fa-triangle-exclamation"></i> ALERTA DATACENTER' : '<i class="fa-solid fa-check-circle"></i> ISP RESIDENCIAL'}
            </div>
            <div class="grid grid-cols-2 gap-2 mt-2 max-h-48 overflow-y-auto pr-2 table-container pb-2">
                ${htmlExtra}
            </div>
        `;
    } catch (e) { datos.innerHTML = `<span class="text-red-500 p-4">Error conectando con IPInfo.</span>`; }
}

function confirmarAsignacion() {
    const ip = document.getElementById('modal-ip-input').value.trim();
    if(!ip) return alert("Falta IP");
    const c = bd.cuentas.find(x => x.id === cuentaSeleccionadaParaAsignar);
    
    if (bd.listaNegra.includes(ip)) return alert("IP en cuarentena.");
    if (bd.cuentas.find(x => x.ip === ip && x.id !== c.id)) return alert("IP usada en otra cuenta.");
    
    // Trazabilidad
    let cambioNodo = false, cambioIP = false;
    if(!esModoEdicionIP && c.nodo !== nodoSeleccionadoParaAsignar) { cambioNodo = true; c.cambios_nodo++; }
    if(c.ip !== ip) { cambioIP = true; c.cambios_ip++; }
    
    if(!esModoEdicionIP) c.nodo = nodoSeleccionadoParaAsignar;
    c.ip = ip;
    
    // Guardar logs
    if(cambioNodo) agregarLog(c.id, `🔗 Nodo Vinculado: ${c.nodo}`);
    if(cambioIP) agregarLog(c.id, `🌍 IP Vinculada: ${c.ip}`);

    guardarBD(); cerrarModalAsignar();
    if(!esModoEdicionIP) { alert("Vinculado."); renderizarPool(); } else { renderizarCuentas(); }
}

function quemarNodo(id) {
    const c = bd.cuentas.find(x => x.id === id);
    if(confirm(`¿Quemar nodo a Cuarentena?`)) {
        if(c.nodo) bd.listaNegra.push(c.nodo); if(c.ip) bd.listaNegra.push(c.ip);
        bd.listaNegra = [...new Set(bd.listaNegra)]; 
        agregarLog(c.id, `🔥 NODO QUEMADO (Cuarentena). Nodo: ${c.nodo} | IP: ${c.ip}`);
        c.nodo = null; c.ip = null; c.score = '';
        guardarBD(); renderizarCuentas();
    }
}

// --- 2. FINANZAS Y CICLOS ---
function renderizarFinanzas() {
    const tbody = document.getElementById('tabla-finanzas'); tbody.innerHTML = '';
    bd.cuentas.forEach(c => {
        let porc = (c.puntos_actuales / META_PUNTOS) * 100; if(porc > 100) porc = 100;
        const color = c.puntos_actuales >= META_PUNTOS ? 'bg-success' : 'bg-blue-500';
        const tr = document.createElement('tr'); tr.className = "hover:bg-gray-50 dark:hover:bg-gray-800/50";
        tr.innerHTML = `
            <td class="px-6 py-4 font-black text-lg">${c.id}</td>
            <td class="px-6 py-4"><progress value="${porc}" max="100" class="w-full h-3 ${color}"></progress><br><span class="text-sm font-black text-gray-800 dark:text-white">${c.puntos_actuales} pts</span></td>
            <td class="px-6 py-4 text-center"><div class="text-sm font-bold text-gray-500">Día: <span class="text-blue-500">${calcularDias(c.inicio_ciclo)}</span></div><div class="font-black text-green-500 mt-1">${formatoFechaCorta(c.ultimo_cobro)}</div></td>
            <td class="px-6 py-4 text-right flex justify-end space-x-2">
                <button onclick="abrirHistorial('${c.id}')" class="text-blue-500 bg-blue-50 dark:bg-blue-900/20 px-3 py-2 rounded-xl" title="Historial"><i class="fa-solid fa-clock-rotate-left"></i></button>
                <button onclick="abrirModalPuntos('${c.id}')" class="bg-gray-200 dark:bg-gray-700 px-4 py-2 rounded-xl text-sm font-bold">Trabajo</button>
                <button onclick="registrarRetiro('${c.id}')" class="${c.puntos_actuales >= META_PUNTOS ? 'bg-green-500 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-400 cursor-not-allowed'} px-5 py-2 rounded-xl text-sm font-black">Cobrar</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}
function abrirModalPuntos(id) {
    cuentaTempPuntos = id; const c = bd.cuentas.find(x => x.id === id);
    document.getElementById('modal-puntos-cuenta').innerText = id; document.getElementById('modal-puntos-actuales').innerText = c.puntos_actuales;
    document.getElementById('input-puntos-sumar').value = ''; document.getElementById('modal-puntos').classList.remove('hidden'); setTimeout(() => document.getElementById('input-puntos-sumar').focus(), 100);
}
function guardarSumaPuntos() {
    const v = parseFloat(document.getElementById('input-puntos-sumar').value); if(isNaN(v)) return;
    const c = bd.cuentas.find(x => x.id === cuentaTempPuntos); c.puntos_actuales += v;
    guardarBD(); document.getElementById('modal-puntos').classList.add('hidden'); renderizarFinanzas();
}
function registrarRetiro(id) {
    const c = bd.cuentas.find(x => x.id === id);
    if(c.puntos_actuales < META_PUNTOS && !confirm("¿Retiro anticipado?")) return;
    if(c.puntos_actuales >= META_PUNTOS && !confirm(`¿Registrar cobro y reiniciar ciclo?`)) return;
    c.historial_retiros.push({ fecha: new Date().toISOString(), puntos: c.puntos_actuales, dias_tardados: calcularDias(c.inicio_ciclo) });
    c.historial_retiros.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
    c.puntos_actuales = 0; c.ultimo_cobro = new Date().toISOString(); c.inicio_ciclo = new Date().toISOString();
    guardarBD(); renderizarFinanzas(); dibujarGraficoFinanciero();
}

// --- HISTORIAL MANUAL ---
function abrirHistorial(id) {
    cuentaTempPuntos = id; document.getElementById('modal-hist-cuenta').innerText = id;
    document.getElementById('hist-manual-fecha').value = ''; document.getElementById('hist-manual-puntos').value = '50';
    renderizarListaHistorial(); document.getElementById('modal-historial').classList.remove('hidden');
}
function renderizarListaHistorial() {
    const c = bd.cuentas.find(x => x.id === cuentaTempPuntos); const lista = document.getElementById('lista-historial'); lista.innerHTML = '';
    if(!c.historial_retiros || c.historial_retiros.length === 0) return lista.innerHTML = '<div class="text-center text-gray-500 py-6">Sin cobros.</div>';
    c.historial_retiros.forEach((ret, idx) => {
        lista.innerHTML += `
            <div class="flex justify-between items-center bg-white dark:bg-gray-800 p-4 rounded-xl border border-gray-200 dark:border-gray-700 mb-2">
                <div><span class="block text-sm font-bold text-gray-500">#${c.historial_retiros.length - idx}</span><span class="block font-black"><i class="fa-regular fa-calendar text-blue-500 mr-2"></i> ${formatoFechaCompleta(ret.fecha)}</span></div>
                <div class="flex items-center space-x-4"><span class="text-xl font-black text-green-500">+${ret.puntos}</span><button onclick="eliminarRegistroHistorial(${idx})" class="text-red-400 hover:text-red-600"><i class="fa-solid fa-trash-can"></i></button></div>
            </div>`;
    });
}
function guardarHistorialManual() {
    const f = document.getElementById('hist-manual-fecha').value, p = parseFloat(document.getElementById('hist-manual-puntos').value);
    if(!f || isNaN(p)) return; const c = bd.cuentas.find(x => x.id === cuentaTempPuntos);
    c.historial_retiros.push({ fecha: new Date(f).toISOString(), puntos: p, dias_tardados: 0 });
    c.historial_retiros.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
    if(c.historial_retiros.length > 0) c.ultimo_cobro = c.historial_retiros[0].fecha;
    guardarBD(); renderizarFinanzas(); renderizarListaHistorial(); document.getElementById('hist-manual-fecha').value = '';
}
function eliminarRegistroHistorial(idx) {
    if(!confirm("¿Borrar cobro histórico?")) return; const c = bd.cuentas.find(x => x.id === cuentaTempPuntos);
    c.historial_retiros.splice(idx, 1); c.ultimo_cobro = c.historial_retiros.length > 0 ? c.historial_retiros[0].fecha : null;
    guardarBD(); renderizarFinanzas(); renderizarListaHistorial();
}

// --- 3. POOL MYSTERIUM ---
function vaciarPool() { if(confirm("¿Vaciar Pool?")) { bd.poolNodos = []; guardarBD(); renderizarPool(); } }
function limpiarFiltrosPool() { ['filtro-nodo','filtro-isp','filtro-region'].forEach(id => document.getElementById(id).value = ''); renderizarPool(); }
function procesarJSON() {
    const file = document.getElementById('archivo-json').files[0]; if (!file) return;
    const reader = new FileReader(); reader.onload = e => { try { bd.poolNodos = JSON.parse(e.target.result).filter(n => ['residential','isp'].includes((n.location?.ip_type||'').toLowerCase())); guardarBD(); renderizarPool(); alert("Pool Cargado."); } catch (err) { alert("JSON Inválido."); } }; reader.readAsText(file);
}
function renderizarPool() {
    const tbody = document.getElementById('tabla-pool'); tbody.innerHTML = '';
    const fNodo = document.getElementById('filtro-nodo').value.toLowerCase(), fIsp = document.getElementById('filtro-isp').value.toLowerCase(), fReg = document.getElementById('filtro-region').value.toLowerCase(), ord = document.getElementById('orden-pool').value;
    let nodos = bd.poolNodos.filter(n => {
        const id14 = truncarNodo(n.provider_id); if (bd.listaNegra.includes(id14) || bd.cuentas.find(c => c.nodo === id14)) return false;
        return id14.includes(fNodo) && (n.location?.isp||"").toLowerCase().includes(fIsp) && `${n.location?.country||''} ${n.location?.region||''} ${n.location?.city||''}`.toLowerCase().includes(fReg);
    });
    nodos.sort((a, b) => ord === 'calidad-desc' ? (b.quality?.quality||0) - (a.quality?.quality||0) : (a.quality?.quality||0) - (b.quality?.quality||0));
    document.getElementById('contador-pool').innerText = `${nodos.length} Resultados`;
    nodos.slice(0, 50).forEach(n => {
        const id14 = truncarNodo(n.provider_id); const tr = document.createElement('tr'); tr.className = "hover:bg-gray-50 dark:hover:bg-gray-800/50";
        tr.innerHTML = `
            <td class="px-6 py-4 font-mono font-bold text-purple-500 tracking-widest">${id14} <button onclick="copiarTexto('${id14}')" class="text-gray-400 hover:text-purple-500 ml-2"><i class="fa-solid fa-copy"></i></button></td>
            <td class="px-6 py-4 font-bold">${n.location?.isp || '-'}</td>
            <td class="px-6 py-4 text-sm text-gray-500">${n.location?.country||''} - ${n.location?.city||''}</td>
            <td class="px-6 py-4 text-center font-black text-lg ${n.quality?.quality >= 2.5 ? 'text-green-500' : 'text-yellow-500'}">${formatoCalidad(n.quality?.quality)}</td>
            <td class="px-6 py-4 text-right"><button onclick="abrirModalAsignarLibre('${id14}')" class="bg-purple-500 text-white px-4 py-2 rounded-xl text-sm font-bold shadow-md"><i class="fa-solid fa-link"></i></button></td>
        `;
        tbody.appendChild(tr);
    });
}
function abrirModalAsignarLibre(nodoID) {
    esModoEdicionIP = false; nodoSeleccionadoParaAsignar = nodoID;
    if(bd.cuentas.length === 0) return alert("Crea una cuenta primero.");
    let html = `<select id="modal-libre-select" class="w-full bg-gray-50 dark:bg-gray-900 border border-gray-600 rounded-xl p-3 mb-4 font-bold outline-none">`;
    bd.cuentas.forEach(c => html += `<option value="${c.id}">${c.id} ${c.nodo ? '(Ocupada)' : '(Vacía)'}</option>`);
    document.getElementById('modal-cuenta-nombre').innerHTML = html + `</select>`;
    document.getElementById('caja-nodo-modal').classList.remove('hidden'); document.getElementById('modal-nodo-id').innerText = nodoID; document.getElementById('modal-ip-input').value = ''; document.getElementById('api-resultados').classList.add('hidden');
    document.getElementById('modal-asignar').querySelector('.bg-blue-500').onclick = function() { cuentaSeleccionadaParaAsignar = document.getElementById('modal-libre-select').value; confirmarAsignacion(); };
    document.getElementById('modal-asignar').classList.remove('hidden');
}

// --- 4. CUARENTENA Y BACKUPS ---
function procesarBlacklistDesordenada() {
    const txt = document.getElementById('texto-sucio-blacklist').value;
    const ips = txt.match(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g) || [];
    const nodos = (txt.match(/0x[a-fA-F0-9]+/g)||[]).map(truncarNodo);
    bd.listaNegra = [...new Set([...bd.listaNegra, ...ips, ...nodos])];
    guardarBD(); document.getElementById('texto-sucio-blacklist').value=''; renderizarBlacklist();
}
function removerBlacklist(i) { if(confirm(`¿Desbloquear?`)) { bd.listaNegra = bd.listaNegra.filter(x => x!==i); guardarBD(); renderizarBlacklist(); } }
function renderizarBlacklist() {
    const c = document.getElementById('contenedor-blacklist'); c.innerHTML='';
    bd.listaNegra.forEach(i => {
        const s = document.createElement('span'); s.className = 'group bg-white dark:bg-gray-800 hover:bg-red-50 text-gray-800 dark:text-gray-300 px-4 py-2 rounded-xl text-base font-mono border border-gray-300 dark:border-gray-700 shadow-sm cursor-pointer flex items-center transition-colors';
        s.innerHTML = `${i} <i class="fa-solid fa-xmark ml-3 text-red-400 group-hover:text-red-600" onclick="removerBlacklist('${i}')"></i>`;
        c.appendChild(s);
    });
}
function exportarBackup() { const a = document.createElement('a'); a.href = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(bd)); a.download = `ProxyFleet_ERP_${new Date().toISOString().split('T')[0]}.json`; document.body.appendChild(a); a.click(); a.remove(); }
function importarBackup(e) { if (!e.target.files[0]) return; const r = new FileReader(); r.onload = ev => { try { bd = JSON.parse(ev.target.result); guardarBD(); location.reload(); } catch(err) { alert("Error"); } }; r.readAsText(e.target.files[0]); }
