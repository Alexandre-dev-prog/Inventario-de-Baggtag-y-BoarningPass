const message = document.getElementById("mensaje");
const tableBody = document.getElementById("tablaCajas");
let boxes = [];

async function api(path, options = {}) {
  const response = await fetch(`/api${path}`, {
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers
    }
  });

  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(result.error || `Error HTTP ${response.status}`);
  }
  return result;
}

function showMessage(text, isError = false) {
  message.textContent = text;
  message.classList.toggle("error", isError);
}

function field(row, ...names) {
  for (const name of names) {
    if (row[name] !== undefined && row[name] !== null) return row[name];
  }
  return "";
}

function renderTypes(types) {
  const select = document.getElementById("tipo");
  select.replaceChildren(new Option("Selecciona un tipo", ""));
  for (const type of types) {
    select.add(new Option(type.Nombre, type.IdTipo));
  }
}

function renderSummary(summary) {
  const container = document.getElementById("resumen");
  container.replaceChildren();
  for (const item of summary) {
    const card = document.createElement("article");
    card.className = "card";
    const title = document.createElement("h3");
    title.textContent = item.TipoProducto;
    const count = document.createElement("p");
    count.textContent = `${item.TotalCajas} cajas`;
    card.append(title, count);
    container.append(card);
  }
}

function renderBoxes() {
  const search = document.getElementById("buscar").value.trim().toLowerCase();
  const filtered = boxes.filter((box) =>
    [field(box, "Codigo", "codigo"), field(box, "Tipo", "Nombre"), field(box, "Ubicacion")]
      .some((value) => String(value).toLowerCase().includes(search))
  );

  tableBody.replaceChildren();
  const select = document.getElementById("cajaConsumo");
  select.replaceChildren(new Option("Selecciona una caja", ""));

  for (const box of boxes) {
    const id = field(box, "IdCaja", "idCaja");
    const code = field(box, "Codigo", "codigo");
    const state = field(box, "Estado", "estado");
    if (!["ANULADA", "AGOTADA"].includes(String(state).toUpperCase())) {
      select.add(new Option(`${code} (${field(box, "Tipo", "Nombre")})`, id));
    }
  }

  for (const box of filtered) {
    const row = document.createElement("tr");
    const values = [
      field(box, "Codigo", "codigo"),
      field(box, "Tipo", "Nombre"),
      field(box, "Rollos", "rollos"),
      field(box, "Unidades", "unidades"),
      field(box, "Estado", "estado"),
      field(box, "Ubicacion", "ubicacion")
    ];
    for (const value of values) {
      const cell = document.createElement("td");
      cell.textContent = value;
      row.append(cell);
    }
    const actionCell = document.createElement("td");
    if (
      String(field(box, "Estado", "estado")).toUpperCase() !== "ANULADA" &&
      !field(box, "TieneMovimientos", "tieneMovimientos")
    ) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = "Anular";
      button.addEventListener("click", () => cancelBox(field(box, "IdCaja", "idCaja")));
      actionCell.append(button);
    }
    row.append(actionCell);
    tableBody.append(row);
  }
}

async function refresh() {
  const [types, currentBoxes, summary] = await Promise.all([
    api("/tipos"),
    api("/cajas"),
    api("/resumen")
  ]);
  boxes = currentBoxes;
  renderTypes(types);
  renderBoxes();
  renderSummary(summary);
}

async function cancelBox(id) {
  if (!window.confirm("¿Anular esta caja?")) return;
  try {
    await api(`/cajas/${encodeURIComponent(id)}/anular`, { method: "POST" });
    await refresh();
    showMessage("Caja anulada correctamente.");
  } catch (error) {
    showMessage(error.message, true);
  }
}

document.getElementById("buscar").addEventListener("input", renderBoxes);

document.getElementById("formCaja").addEventListener("submit", async (event) => {
  event.preventDefault();
  const data = {
    codigo: document.getElementById("codigo").value,
    idTipo: document.getElementById("tipo").value,
    proveedor: document.getElementById("proveedor").value,
    ubicacion: document.getElementById("ubicacion").value
  };
  try {
    await api("/cajas", { method: "POST", body: JSON.stringify(data) });
    event.target.reset();
    await refresh();
    showMessage("Caja registrada correctamente.");
  } catch (error) {
    showMessage(error.message, true);
  }
});

document.getElementById("formConsumo").addEventListener("submit", async (event) => {
  event.preventDefault();
  const data = {
    idCaja: document.getElementById("cajaConsumo").value,
    rollos: document.getElementById("rollos").value,
    unidades: document.getElementById("unidades").value,
    responsable: document.getElementById("responsable").value,
    observacion: document.getElementById("observacion").value
  };
  try {
    await api("/consumos", { method: "POST", body: JSON.stringify(data) });
    event.target.reset();
    await refresh();
    showMessage("Consumo registrado correctamente.");
  } catch (error) {
    showMessage(error.message, true);
  }
});

document.querySelectorAll("[data-reporte]").forEach((button) => {
  button.addEventListener("click", async () => {
    const report = button.dataset.reporte;
    const output = document.getElementById("reporte");
    output.textContent = "Cargando reporte...";
    try {
      const result = await api(`/reportes/${encodeURIComponent(report)}`);
      output.textContent = JSON.stringify(result, null, 2);
    } catch (error) {
      output.textContent = error.message;
    }
  });
});

refresh().catch((error) => showMessage(error.message, true));
