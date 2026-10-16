import os
from pathlib import Path

import pyodbc
from dotenv import load_dotenv
from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS


BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / ".env")

app = Flask(__name__)
CORS(app)


def get_connection():
    connection_string = os.getenv("DB_CONN")
    if not connection_string:
        raise RuntimeError("DB_CONN no está configurada. Revisa el archivo .env.")
    return pyodbc.connect(connection_string, timeout=5)


def database_error(error):
    if isinstance(error, RuntimeError):
        app.logger.error("%s", error)
        return jsonify({"error": str(error)}), 503

    app.logger.exception("Error al acceder a SQL Server")
    return jsonify({"error": "No se pudo completar la operación en la base de datos."}), 500


def rows_as_dicts(cursor):
    columns = [column[0] for column in cursor.description]
    return [dict(zip(columns, row)) for row in cursor.fetchall()]


@app.get("/")
def index():
    return send_from_directory(BASE_DIR, "index.html")


@app.get("/client.js")
def client_script():
    return send_from_directory(BASE_DIR, "client.js")


@app.get("/styles.css")
def stylesheet():
    return send_from_directory(BASE_DIR, "styles.css")


@app.get("/api/tipos")
def listar_tipos():
    connection = None
    try:
        connection = get_connection()
        cursor = connection.cursor()
        cursor.execute(
            "SELECT IdTipo, Nombre, RollosPorCaja, UnidadesPorRollo "
            "FROM dbo.TipoProducto WHERE Activo = 1"
        )
        return jsonify(rows_as_dicts(cursor))
    except (pyodbc.Error, RuntimeError) as error:
        return database_error(error)
    finally:
        if connection is not None:
            connection.close()


@app.get("/api/cajas")
def listar_cajas():
    connection = None
    try:
        connection = get_connection()
        cursor = connection.cursor()
        cursor.execute(
            "SELECT c.IdCaja, c.Codigo, c.IdTipo, c.Proveedor, c.Ubicacion, "
            "CASE WHEN c.Estado <> 'ANULADA' "
            "AND COALESCE(SUM(r.UnidadesRestantes), 0) = 0 THEN 'AGOTADA' "
            "ELSE c.Estado END AS Estado, c.FechaRegistro, t.Nombre AS Tipo, "
            "COUNT(CASE WHEN r.UnidadesRestantes > 0 THEN 1 END) AS Rollos, "
            "COALESCE(SUM(r.UnidadesRestantes), 0) AS Unidades, "
            "CAST(CASE WHEN EXISTS (SELECT 1 FROM dbo.Rollo AS rx "
            "JOIN dbo.Movimiento AS mx ON mx.IdRollo = rx.IdRollo "
            "WHERE rx.IdCaja = c.IdCaja) THEN 1 ELSE 0 END AS BIT) "
            "AS TieneMovimientos "
            "FROM dbo.Caja AS c "
            "LEFT JOIN dbo.TipoProducto AS t ON t.IdTipo = c.IdTipo "
            "LEFT JOIN dbo.Rollo AS r ON r.IdCaja = c.IdCaja "
            "GROUP BY c.IdCaja, c.Codigo, c.IdTipo, c.Proveedor, c.Ubicacion, "
            "c.Estado, c.FechaRegistro, t.Nombre "
            "ORDER BY c.IdCaja DESC"
        )
        return jsonify(rows_as_dicts(cursor))
    except (pyodbc.Error, RuntimeError) as error:
        return database_error(error)
    finally:
        if connection is not None:
            connection.close()


@app.get("/api/resumen")
def resumen():
    connection = None
    try:
        connection = get_connection()
        cursor = connection.cursor()
        cursor.execute(
            "SELECT t.Nombre AS TipoProducto, COUNT(c.IdCaja) AS TotalCajas "
            "FROM dbo.TipoProducto AS t "
            "LEFT JOIN dbo.Caja AS c "
            "ON c.IdTipo = t.IdTipo AND c.Estado <> 'ANULADA' "
            "GROUP BY t.Nombre"
        )
        return jsonify(rows_as_dicts(cursor))
    except (pyodbc.Error, RuntimeError) as error:
        return database_error(error)
    finally:
        if connection is not None:
            connection.close()


@app.post("/api/cajas")
def registrar_caja():
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return jsonify({"error": "Se esperaba un objeto JSON."}), 400

    codigo = data.get("codigo")
    id_tipo = data.get("idTipo")
    if not isinstance(codigo, str) or not codigo.strip():
        return jsonify({"error": "El código es obligatorio."}), 400
    try:
        id_tipo = int(id_tipo)
    except (TypeError, ValueError):
        return jsonify({"error": "El tipo de producto no es válido."}), 400
    if id_tipo <= 0:
        return jsonify({"error": "El tipo de producto no es válido."}), 400
    proveedor = data.get("proveedor") or None
    ubicacion = data.get("ubicacion") or None
    if len(codigo.strip()) > 30:
        return jsonify({"error": "El código no puede superar 30 caracteres."}), 400
    if proveedor is not None and (not isinstance(proveedor, str) or len(proveedor) > 100):
        return jsonify({"error": "El proveedor no puede superar 100 caracteres."}), 400
    if ubicacion is not None and (not isinstance(ubicacion, str) or len(ubicacion) > 100):
        return jsonify({"error": "La ubicación no puede superar 100 caracteres."}), 400

    connection = None
    try:
        connection = get_connection()
        connection.cursor().execute(
            "EXEC dbo.sp_RegistrarCaja ?, ?, ?, ?",
            codigo.strip(),
            id_tipo,
            proveedor,
            ubicacion,
        )
        connection.commit()
        return jsonify({"ok": True}), 201
    except (pyodbc.Error, RuntimeError) as error:
        if connection is not None:
            connection.rollback()
        return database_error(error)
    finally:
        if connection is not None:
            connection.close()


@app.post("/api/consumos")
def registrar_consumo():
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return jsonify({"error": "Se esperaba un objeto JSON."}), 400

    try:
        id_caja = int(data.get("idCaja"))
        rollos = int(data.get("rollos"))
        unidades = int(data.get("unidades"))
    except (TypeError, ValueError):
        return jsonify({"error": "Las cantidades del consumo no son válidas."}), 400
    if id_caja <= 0 or rollos < 0 or unidades < 0 or (rollos == 0 and unidades == 0):
        return jsonify({"error": "Las cantidades del consumo no son válidas."}), 400
    responsable = data.get("responsable")
    observacion = data.get("observacion") or None
    if not isinstance(responsable, str) or not responsable.strip():
        return jsonify({"error": "El responsable es obligatorio."}), 400
    responsable = responsable.strip()
    if len(responsable) > 80:
        return jsonify({"error": "El responsable no puede superar 80 caracteres."}), 400
    if observacion is not None and (
        not isinstance(observacion, str) or len(observacion) > 200
    ):
        return jsonify({"error": "La observación no puede superar 200 caracteres."}), 400

    connection = None
    try:
        connection = get_connection()
        cursor = connection.cursor()
        cursor.execute(
            "SELECT Estado FROM dbo.Caja WITH (UPDLOCK, HOLDLOCK) WHERE IdCaja = ?",
            id_caja,
        )
        box = cursor.fetchone()
        if box is None:
            connection.rollback()
            return jsonify({"error": "La caja no existe."}), 404
        if box[0] == "ANULADA":
            connection.rollback()
            return jsonify({"error": "No se puede consumir una caja anulada."}), 409

        cursor.execute(
            "SELECT IdRollo, UnidadesRestantes FROM dbo.Rollo "
            "WITH (UPDLOCK, ROWLOCK) "
            "WHERE IdCaja = ? AND UnidadesRestantes > 0 "
            "ORDER BY UnidadesRestantes, NumeroRollo, IdRollo",
            id_caja,
        )
        available_rolls = cursor.fetchall()
        if rollos > len(available_rolls):
            connection.rollback()
            return jsonify({"error": "La caja no tiene suficientes rollos disponibles."}), 400

        movements = []
        for roll in available_rolls[:rollos]:
            movements.append((roll[0], roll[1]))

        units_left = unidades
        for roll in available_rolls[rollos:]:
            if not units_left:
                break
            consumed = min(units_left, roll[1])
            movements.append((roll[0], consumed))
            units_left -= consumed
        if units_left:
            connection.rollback()
            return jsonify({"error": "La caja no tiene suficientes unidades disponibles."}), 400

        for id_rollo, cantidad in movements:
            cursor.execute(
                "EXEC dbo.sp_RegistrarMovimiento ?, ?, ?, ?, ?",
                id_rollo,
                "CONSUMO",
                cantidad,
                responsable,
                observacion,
            )
        cursor.execute(
            "UPDATE dbo.Caja SET Estado = CASE "
            "WHEN NOT EXISTS (SELECT 1 FROM dbo.Rollo "
            "WHERE IdCaja = ? AND UnidadesRestantes > 0) THEN 'AGOTADA' "
            "ELSE 'EN_USO' END WHERE IdCaja = ?",
            id_caja,
            id_caja,
        )
        connection.commit()
        return jsonify({"ok": True, "movimientos": len(movements)}), 201
    except (pyodbc.Error, RuntimeError) as error:
        if connection is not None:
            connection.rollback()
        return database_error(error)
    finally:
        if connection is not None:
            connection.close()


@app.post("/api/cajas/<int:id_caja>/anular")
def anular_caja(id_caja):
    connection = None
    try:
        connection = get_connection()
        cursor = connection.cursor()
        cursor.execute(
            "SELECT Estado FROM dbo.Caja WITH (UPDLOCK, HOLDLOCK) WHERE IdCaja = ?",
            id_caja,
        )
        box = cursor.fetchone()
        if box is None:
            connection.rollback()
            return jsonify({"error": "La caja no existe."}), 404
        if box[0] == "ANULADA":
            connection.rollback()
            return jsonify({"error": "La caja ya está anulada."}), 409

        cursor.execute(
            "SELECT TOP 1 1 FROM dbo.Movimiento AS m "
            "JOIN dbo.Rollo AS r ON r.IdRollo = m.IdRollo "
            "WHERE r.IdCaja = ?",
            id_caja,
        )
        if cursor.fetchone() is not None:
            connection.rollback()
            return jsonify({
                "error": "No se puede anular una caja que ya tiene consumos registrados."
            }), 409

        cursor.execute(
            "UPDATE dbo.Caja SET Estado = 'ANULADA' "
            "WHERE IdCaja = ? AND Estado <> 'ANULADA'",
            id_caja,
        )
        connection.commit()
        return jsonify({"ok": True})
    except (pyodbc.Error, RuntimeError) as error:
        if connection is not None:
            connection.rollback()
        return database_error(error)
    finally:
        if connection is not None:
            connection.close()


@app.get("/api/reportes/agotadas-mes")
def reporte_agotadas_mes():
    connection = None
    try:
        connection = get_connection()
        cursor = connection.cursor()
        cursor.execute(
            "WITH StockPorCaja AS ("
            "SELECT IdCaja, COUNT(CASE WHEN UnidadesRestantes > 0 THEN 1 END) AS Rollos, "
            "COALESCE(SUM(UnidadesRestantes), 0) AS Unidades "
            "FROM dbo.Rollo GROUP BY IdCaja"
            "), UltimoMovimiento AS ("
            "SELECT r.IdCaja, MAX(m.FechaMovimiento) AS FechaAgotada "
            "FROM dbo.Movimiento AS m "
            "JOIN dbo.Rollo AS r ON r.IdRollo = m.IdRollo "
            "WHERE m.TipoMovimiento = 'CONSUMO' GROUP BY r.IdCaja"
            ") "
            "SELECT c.IdCaja, c.Codigo, t.Nombre AS Tipo, "
            "um.FechaAgotada, spc.Rollos, spc.Unidades "
            "FROM dbo.Caja AS c "
            "JOIN StockPorCaja AS spc ON spc.IdCaja = c.IdCaja "
            "JOIN UltimoMovimiento AS um ON um.IdCaja = c.IdCaja "
            "JOIN dbo.TipoProducto AS t ON t.IdTipo = c.IdTipo "
            "WHERE c.Estado <> 'ANULADA' AND spc.Unidades = 0 "
            "AND um.FechaAgotada >= DATEFROMPARTS(YEAR(GETDATE()), MONTH(GETDATE()), 1) "
            "AND um.FechaAgotada < DATEADD(MONTH, 1, "
            "DATEFROMPARTS(YEAR(GETDATE()), MONTH(GETDATE()), 1))"
        )
        return jsonify(rows_as_dicts(cursor))
    except (pyodbc.Error, RuntimeError) as error:
        return database_error(error)
    finally:
        if connection is not None:
            connection.close()


@app.get("/api/reportes/stock-minimo")
def reporte_stock_minimo():
    connection = None
    try:
        connection = get_connection()
        cursor = connection.cursor()
        cursor.execute(
            "SELECT t.IdTipo, t.Nombre AS Tipo, "
            "SUM(COALESCE(r.UnidadesRestantes, 0)) AS UnidadesDisponibles, "
            "SUM(COALESCE(r.UnidadesIniciales, 0)) AS UnidadesIniciales, "
            "CAST(SUM(COALESCE(r.UnidadesIniciales, 0)) * 0.10 AS DECIMAL(18, 2)) "
            "AS UmbralMinimo "
            "FROM dbo.TipoProducto AS t "
            "JOIN dbo.Caja AS c ON c.IdTipo = t.IdTipo AND c.Estado <> 'ANULADA' "
            "JOIN dbo.Rollo AS r ON r.IdCaja = c.IdCaja "
            "GROUP BY t.IdTipo, t.Nombre "
            "HAVING SUM(COALESCE(r.UnidadesIniciales, 0)) > 0 "
            "AND SUM(COALESCE(r.UnidadesRestantes, 0)) <= "
            "SUM(COALESCE(r.UnidadesIniciales, 0)) * 0.10"
        )
        return jsonify(rows_as_dicts(cursor))
    except (pyodbc.Error, RuntimeError) as error:
        return database_error(error)
    finally:
        if connection is not None:
            connection.close()


@app.get("/api/reportes/consumo-30-dias")
def reporte_consumo_30_dias():
    connection = None
    try:
        connection = get_connection()
        cursor = connection.cursor()
        cursor.execute(
            "SELECT t.Nombre AS Tipo, SUM(m.Cantidad) AS UnidadesConsumidas, "
            "COUNT(m.IdMovimiento) AS Movimientos "
            "FROM dbo.Movimiento AS m "
            "JOIN dbo.Rollo AS r ON r.IdRollo = m.IdRollo "
            "JOIN dbo.Caja AS c ON c.IdCaja = r.IdCaja "
            "JOIN dbo.TipoProducto AS t ON t.IdTipo = c.IdTipo "
            "WHERE m.TipoMovimiento = 'CONSUMO' "
            "AND m.FechaMovimiento >= DATEADD(DAY, -30, GETDATE()) "
            "GROUP BY t.Nombre ORDER BY t.Nombre"
        )
        return jsonify(rows_as_dicts(cursor))
    except (pyodbc.Error, RuntimeError) as error:
        return database_error(error)
    finally:
        if connection is not None:
            connection.close()


if __name__ == "__main__":
    app.run(host="127.0.0.1", debug=False, port=5000)
