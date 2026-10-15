const express = require("express");
const sql = require("mssql");
const cors = require("cors");

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

// Configuración de conexión a SQL Server
const config = {
    user: process.env.SQL_USER,
    password: process.env.SQL_PASSWORD,
    server: "127.0.0.1",
    port: 1433,
    database: "Genius",
    options: {
        encrypt: false,
        trustServerCertificate: true
    }
};

let poolPromise = sql.connect(config);

// Función para ejecutar consultas
async function consultar(consulta, parametros = {}) {
    const pool = await poolPromise;
    const request = pool.request();

    for (const [nombre, valor] of Object.entries(parametros)) {
        request.input(nombre, valor);
    }

    return request.query(consulta);
}

// Consultar tipos de productos
app.get("/api/tipos", async (req, res) => {
    try {
        const resultado = await consultar(`
            SELECT *
            FROM dbo.TipoProducto
        `);

        res.json(resultado.recordset);
    } catch (error) {
        res.status(500).json({
            error: "Error al consultar los tipos de productos."
        });
    }
});

// Consultar cajas
app.get("/api/cajas", async (req, res) => {
    try {
        const resultado = await consultar(`
            SELECT *
            FROM dbo.Caja
            ORDER BY IdCaja DESC
        `);

        res.json(resultado.recordset);
    } catch (error) {
        res.status(500).json({
            error: "Error al consultar las cajas."
        });
    }
});

// Consultar resumen del inventario
app.get("/api/resumen", async (req, res) => {
    try {
        const resultado = await consultar(`
            SELECT
                t.Nombre AS TipoProducto,
                COUNT(c.IdCaja) AS TotalCajas
            FROM dbo.TipoProducto t
            LEFT JOIN dbo.Caja c
                ON c.IdTipo = t.IdTipo
            GROUP BY t.Nombre
        `);

        res.json(resultado.recordset);
    } catch (error) {
        res.status(500).json({
            error: "Error al consultar el inventario."
        });
    }
});

// Registrar una caja
app.post("/api/cajas", async (req, res) => {
    const { codigo, idTipo, proveedor, ubicacion } = req.body;

    if (!codigo || !idTipo) {
        return res.status(400).json({
            error: "El código y el tipo de producto son obligatorios."
        });
    }

    try {
        const pool = await poolPromise;

        await pool.request()
            .input("Codigo", sql.VarChar(50), codigo)
            .input("IdTipo", sql.Int, Number(idTipo))
            .input("Proveedor", sql.VarChar(100), proveedor || null)
            .input("Ubicacion", sql.VarChar(100), ubicacion || null)
            .execute("dbo.sp_RegistrarCaja");

        res.status(201).json({
            mensaje: "Caja registrada correctamente."
        });
    } catch (error) {
        res.status(500).json({
            error: "No se pudo registrar la caja."
        });
    }
});

// Registrar consumo de una caja
app.post("/api/consumos", async (req, res) => {
    const { idCaja, rollos, unidades, observacion } = req.body;

    if (!idCaja || rollos == null || unidades == null) {
        return res.status(400).json({
            error: "Debés indicar la caja, los rollos y las unidades."
        });
    }

    if (
        !Number.isInteger(Number(idCaja)) ||
        !Number.isInteger(Number(rollos)) ||
        !Number.isInteger(Number(unidades)) ||
        Number(rollos) < 0 ||
        Number(unidades) < 0 ||
        (Number(rollos) === 0 && Number(unidades) === 0)
    ) {
        return res.status(400).json({
            error: "Las cantidades del consumo no son válidas."
        });
    }

    try {
        const pool = await poolPromise;

        await pool.request()
            .input("IdCaja", sql.Int, Number(idCaja))
            .input("Rollos", sql.Int, Number(rollos))
            .input("Unidades", sql.Int, Number(unidades))
            .input("Observacion", sql.VarChar(250), observacion || null)
            .execute("dbo.sp_RegistrarConsumo");

        res.status(201).json({
            mensaje: "Consumo registrado correctamente."
        });
    } catch (error) {
        res.status(500).json({
            error: "No se pudo registrar el consumo."
        });
    }
});

// Anular una caja
app.post("/api/cajas/:id/anular", async (req, res) => {
    const idCaja = Number(req.params.id);

    if (!Number.isInteger(idCaja) || idCaja <= 0) {
        return res.status(400).json({
            error: "El identificador de la caja no es válido."
        });
    }

    try {
        const pool = await poolPromise;

        await pool.request()
            .input("IdCaja", sql.Int, idCaja)
            .execute("dbo.sp_AnularCaja");

        res.json({
            mensaje: "Caja anulada correctamente."
        });
    } catch (error) {
        res.status(500).json({
            error: "No se pudo anular la caja."
        });
    }
});

// Consultar cajas agotadas
app.get("/api/reportes/agotadas-mes", async (req, res) => {
    try {
        const resultado = await consultar(`
            SELECT *
            FROM dbo.Caja
            WHERE Estado = 'AGOTADA'
              AND FechaAgotada >=
                  DATEFROMPARTS(YEAR(GETDATE()), MONTH(GETDATE()), 1)
              AND FechaAgotada <
                  DATEADD(
                      MONTH,
                      1,
                      DATEFROMPARTS(YEAR(GETDATE()), MONTH(GETDATE()), 1)
                  )
        `);

        res.json(resultado.recordset);
    } catch (error) {
        res.status(500).json({
            error: "Error al generar el reporte."
        });
    }
});

// Iniciar servidor
app.listen(PORT, () => {
    console.log(`API disponible en http://localhost:${PORT}`);
});