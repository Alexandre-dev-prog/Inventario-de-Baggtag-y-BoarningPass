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

function showMessage(text, isError = false, target = message) {
  target.textContent = text;
  target.classList.toggle("error", isError);
}

function field(row, ...names) {
  for (const name of names) {
    if (row[name] !== undefined && row[name] !== null) return row[name];
  }
  return "";
}

function displayBoxStatus(status) {
  const labels = {
    EN_USO: "ENTREGADA",
    SELLADA: "ALMACENADA"
  };
  const normalizedStatus = String(status).toUpperCase();
  return labels[normalizedStatus] || status;
}

function renderTypes(types) {
  for (const id of ["tipo", "tipoEntrega"]) {
    const select = document.getElementById(id);
    select.replaceChildren(new Option("Selecciona un tipo", ""));
    for (const type of types) {
      select.add(new Option(type.Nombre, type.IdTipo));
    }
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
    const totalBoxes = Number(item.TotalCajas);
    count.textContent = `${totalBoxes} ${totalBoxes === 1 ? "caja" : "cajas"}`;
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
  const airlineType = document.getElementById("tipoEntrega").value;
  const airlineBoxes = document.getElementById("cajasEntrega");
  const previouslySelected = new Set(
    Array.from(
      airlineBoxes.querySelectorAll('input[type="checkbox"]:checked'),
      (checkbox) => checkbox.value
    )
  );
  airlineBoxes.replaceChildren();
  const availableAirlineBoxes = [];

  for (const box of boxes) {
    const id = field(box, "IdCaja", "idCaja");
    const code = field(box, "Codigo", "codigo");
    const state = field(box, "Estado", "estado");
    const normalizedState = String(state).toUpperCase();
    if (!["ANULADA", "AGOTADA", "ENTREGADA"].includes(normalizedState)) {
      select.add(new Option(`${code} (${field(box, "Tipo", "Nombre")})`, id));
    }
    if (
      airlineType &&
      normalizedState === "SELLADA" &&
      Number(field(box, "IdTipo", "idTipo")) === Number(airlineType) &&
      !field(box, "TieneMovimientos", "tieneMovimientos") &&
      Number(field(box, "Unidades", "unidades")) > 0
    ) {
      availableAirlineBoxes.push({ id, code });
    }
  }

  if (!airlineType || availableAirlineBoxes.length === 0) {
    const emptyMessage = document.createElement("p");
    emptyMessage.className = "box-choice-empty";
    emptyMessage.textContent = airlineType
      ? "No hay cajas selladas disponibles de este tipo."
      : "Primero selecciona un tipo de caja.";
    airlineBoxes.append(emptyMessage);
  } else {
    for (const box of availableAirlineBoxes) {
      const choice = document.createElement("label");
      choice.className = "box-choice";
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.value = box.id;
      checkbox.checked = previouslySelected.has(String(box.id));
      checkbox.addEventListener("change", updateAirlineSelectionHelp);
      const description = document.createElement("span");
      description.textContent = `${box.code} · Caja #${box.id}`;
      choice.append(checkbox, description);
      airlineBoxes.append(choice);
    }
  }
  updateAirlineSelectionHelp();

  for (const box of filtered) {
    const row = document.createElement("tr");
    const values = [
      field(box, "Codigo", "codigo"),
      field(box, "Tipo", "Nombre"),
      field(box, "Rollos", "rollos"),
      field(box, "Unidades", "unidades"),
      field(box, "Estado", "estado"),
      field(box, "Aerolinea", "aerolinea"),
      field(box, "RecibidoPor", "recibidoPor"),
      field(box, "Ubicacion", "ubicacion")
    ];
    for (const [index, value] of values.entries()) {
      const cell = document.createElement("td");
      cell.textContent = index === 4 ? displayBoxStatus(value) : value;
      row.append(cell);
    }
    const actionCell = document.createElement("td");
    const state = String(field(box, "Estado", "estado")).toUpperCase();
    if (state !== "ANULADA" && state !== "ENTREGADA" && !field(box, "TieneMovimientos", "tieneMovimientos")) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = "Anular";
      button.addEventListener("click", () => cancelBox(field(box, "IdCaja", "idCaja")));
      actionCell.append(button);
    }
    if (["ANULADA", "AGOTADA", "ENTREGADA"].includes(state)) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "delete-box";
      button.textContent = "Eliminar";
      button.addEventListener("click", () =>
        deleteBox(field(box, "IdCaja", "idCaja"), field(box, "Codigo", "codigo"))
      );
      actionCell.append(button);
    }

    row.append(actionCell);
    tableBody.append(row);
  }
}

function setOutputMode(mode) {
  const airline = mode === "aerolinea";
  document.getElementById("formEntrega").hidden = !airline;
  document.getElementById("mensajeEntrega").hidden = !airline;
  document.getElementById("formConsumo").hidden = airline;
  document.getElementById("mensajeConsumo").hidden = airline;
  document.getElementById("ayudaSalida").textContent = airline
    ? "Indica la aerolínea, el tipo, la cantidad, los códigos exactos y quién recibe las cajas. Todos son obligatorios."
    : "Selecciona una caja e indica las unidades que se descontarán. El responsable es obligatorio.";
  document.querySelectorAll("[data-modo]").forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.modo === mode));
  });
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

async function deleteBox(id, code) {
  const confirmed = window.confirm(
    `¿Eliminar permanentemente la caja ${code}? Se borrarán sus rollos y consumos. Si era la única caja de su entrega, también se eliminará ese registro. Esta acción no se puede deshacer.`
  );
  if (!confirmed) return;
  try {
    await api(`/cajas/${encodeURIComponent(id)}`, { method: "DELETE" });
    await refresh();
    showMessage(`La caja ${code} y su historial relacionado se eliminaron permanentemente.`);
  } catch (error) {
    showMessage(error.message, true);
  }
}

document.getElementById("buscar").addEventListener("input", renderBoxes);
document.getElementById("tipoEntrega").addEventListener("change", renderBoxes);

document.querySelectorAll("[data-modo]").forEach((button) => {
  button.addEventListener("click", () => setOutputMode(button.dataset.modo));
});

document.getElementById("formEntrega").addEventListener("submit", async (event) => {
  event.preventDefault();
  const status = document.getElementById("mensajeEntrega");
  const selectedBoxIds = Array.from(
    document.querySelectorAll('#cajasEntrega input[type="checkbox"]:checked'),
    (checkbox) => checkbox.value
  );
  const quantity = Number(document.getElementById("cantidadCajas").value);
  if (selectedBoxIds.length === 0) {
    showMessage(
      "Marca al menos una caja para registrar la entrega.",
      true,
      status
    );
    return;
  }
  if (selectedBoxIds.length !== quantity) {
    showMessage("La cantidad debe coincidir con las cajas marcadas.", true, status);
    return;
  }
  const data = {
    aerolinea: document.getElementById("aerolinea").value,
    idTipo: document.getElementById("tipoEntrega").value,
    cantidadCajas: quantity,
    cajaIds: selectedBoxIds,
    recibidoPor: document.getElementById("recibidoPor").value
  };
  try {
    await api("/entregas", { method: "POST", body: JSON.stringify(data) });
    event.target.reset();
    renderBoxes();
    showMessage(
      `Entrega registrada para ${data.aerolinea.trim()}: ${quantity} caja(s). Recibió: ${data.recibidoPor.trim()}.`,
      false,
      status
    );
    try {
      await refresh();
    } catch (error) {
      showMessage(
        `La entrega se registró, pero no se pudo actualizar la lista: ${error.message}`,
        true,
        status
      );
    }
  } catch (error) {
    showMessage(`No se pudo registrar la entrega: ${error.message}`, true, status);
  }
});

function updateAirlineSelectionHelp() {
  const selected = document.querySelectorAll(
    '#cajasEntrega input[type="checkbox"]:checked'
  ).length;
  document.getElementById("cantidadCajas").value = selected || "";
  document.getElementById("ayudaCodigos").textContent = selected
    ? `${selected} caja(s) seleccionada(s). Cada casilla corresponde a una caja física.`
    : "Marca las cajas que vas a entregar. Cada casilla corresponde a una caja física.";
}

document.getElementById("formCaja").addEventListener("submit", async (event) => {
  event.preventDefault();
  const status = document.getElementById("mensajeCaja");
  const data = {
    codigo: document.getElementById("codigo").value,
    idTipo: document.getElementById("tipo").value,
    proveedor: document.getElementById("proveedor").value,
    ubicacion: document.getElementById("ubicacion").value
  };
  try {
    await api("/cajas", { method: "POST", body: JSON.stringify(data) });
    event.target.reset();
    showMessage(`La caja ${data.codigo.trim()} se registró correctamente.`, false, status);
    try {
      await refresh();
    } catch (error) {
      showMessage(
        `La caja se registró, pero no se pudo actualizar la lista: ${error.message}`,
        true,
        status
      );
    }
  } catch (error) {
    showMessage(`No se pudo registrar la caja: ${error.message}`, true, status);
  }
});

document.getElementById("formConsumo").addEventListener("submit", async (event) => {
  event.preventDefault();
  const status = document.getElementById("mensajeConsumo");
  const data = {
    idCaja: document.getElementById("cajaConsumo").value,
    rollos: 0,
    unidades: document.getElementById("unidades").value,
    responsable: document.getElementById("responsable").value,
    observacion: document.getElementById("observacion").value
  };
  try {
    await api("/consumos", { method: "POST", body: JSON.stringify(data) });
    event.target.reset();
    showMessage("Consumo registrado correctamente.", false, status);
    try {
      await refresh();
    } catch (error) {
      showMessage(
        `El consumo se registró, pero no se pudo actualizar la lista: ${error.message}`,
        true,
        status
      );
    }
  } catch (error) {
    showMessage(`No se pudo registrar el consumo: ${error.message}`, true, status);
  }
});

const reportDefinitions = {
  "agotadas-mes": {
    empty: "No hay cajas agotadas este mes.",
    columns: [
      ["Codigo", "Código"],
      ["Tipo", "Tipo"],
      ["FechaAgotada", "Fecha de agotamiento"],
      ["Rollos", "Rollos disponibles"],
      ["Unidades", "Unidades disponibles"]
    ]
  },
  "stock-minimo": {
    empty: "No hay tipos de producto por debajo del stock mínimo (10%).",
    columns: [
      ["Tipo", "Tipo"],
      ["UnidadesDisponibles", "Unidades disponibles"],
      ["UnidadesIniciales", "Stock inicial"],
      ["UmbralMinimo", "Umbral mínimo"]
    ]
  },
  "consumo-30-dias": {
    empty: "No se registraron consumos en los últimos 30 días.",
    columns: [
      ["Tipo", "Tipo"],
      ["UnidadesConsumidas", "Unidades consumidas"],
      ["Movimientos", "Movimientos"]
    ]
  }
};

function renderReport(output, report, rows) {
  output.replaceChildren();
  if (rows.length === 0) {
    output.textContent = reportDefinitions[report].empty;
    return;
  }

  const table = document.createElement("table");
  table.className = "report-table";
  const head = table.createTHead().insertRow();
  for (const [, label] of reportDefinitions[report].columns) {
    const cell = document.createElement("th");
    cell.scope = "col";
    cell.textContent = label;
    head.append(cell);
  }

  const body = table.createTBody();
  for (const row of rows) {
    const tableRow = body.insertRow();
    for (const [key] of reportDefinitions[report].columns) {
      const cell = tableRow.insertCell();
      const value = row[key];
      cell.textContent = value == null ? "" : String(value);
    }
  }
  output.append(table);
}

document.querySelectorAll("[data-reporte]").forEach((button) => {
  button.addEventListener("click", async () => {
    const report = button.dataset.reporte;
    const output = document.getElementById("reporte");
    output.textContent = "Cargando reporte…";
    try {
      const result = await api(`/reportes/${encodeURIComponent(report)}`);
      renderReport(output, report, result);
    } catch (error) {
      output.replaceChildren();
      output.textContent = error.message;
    }
  });
});

setOutputMode("kiosko");
refresh().catch((error) => showMessage(error.message, true));
