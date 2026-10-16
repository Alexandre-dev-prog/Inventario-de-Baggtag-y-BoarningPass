IF OBJECT_ID('dbo.Entrega', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.Entrega (
        IdEntrega INT IDENTITY(1,1) NOT NULL
            CONSTRAINT PK_Entrega PRIMARY KEY,
        Aerolinea VARCHAR(100) NOT NULL,
        RecibidoPor VARCHAR(80) NOT NULL,
        FechaEntrega DATETIME2 NOT NULL
            CONSTRAINT DF_Entrega_FechaEntrega DEFAULT SYSDATETIME()
    );
END;
GO

IF OBJECT_ID('dbo.EntregaCaja', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.EntregaCaja (
        IdEntrega INT NOT NULL,
        IdCaja INT NOT NULL,
        CONSTRAINT PK_EntregaCaja PRIMARY KEY (IdEntrega, IdCaja),
        CONSTRAINT UQ_EntregaCaja_IdCaja UNIQUE (IdCaja),
        CONSTRAINT FK_EntregaCaja_Entrega FOREIGN KEY (IdEntrega)
            REFERENCES dbo.Entrega (IdEntrega),
        CONSTRAINT FK_EntregaCaja_Caja FOREIGN KEY (IdCaja)
            REFERENCES dbo.Caja (IdCaja)
    );
END;
GO
