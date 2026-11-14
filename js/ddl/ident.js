/**
 * Nomes no SQL: palavras reservadas do Oracle vão entre aspas.
 */
(function (DDL) {
  'use strict';

  /** Palavras reservadas do Oracle (V$RESERVED_WORDS com RESERVED='Y'). */
  const RESERVED = new Set(
    `ACCESS ADD ALL ALTER AND ANY AS ASC AUDIT BETWEEN BY CHAR CHECK CLUSTER COLUMN COMMENT COMPRESS CONNECT
     CREATE CURRENT DATE DECIMAL DEFAULT DELETE DESC DISTINCT DROP ELSE EXCLUSIVE EXISTS FILE FLOAT FOR FROM
     GRANT GROUP HAVING IDENTIFIED IMMEDIATE IN INCREMENT INDEX INITIAL INSERT INTEGER INTERSECT INTO IS LEVEL
     LIKE LOCK LONG MAXEXTENTS MINUS MLSLABEL MODE MODIFY NOAUDIT NOCOMPRESS NOT NOWAIT NULL NUMBER OF OFFLINE
     ON ONLINE OPTION OR ORDER PCTFREE PRIOR PUBLIC RAW RENAME RESOURCE REVOKE ROW ROWID ROWNUM ROWS SELECT
     SESSION SET SHARE SIZE SMALLINT START SUCCESSFUL SYNONYM SYSDATE TABLE THEN TO TRIGGER UID UNION UNIQUE
     UPDATE USER VALIDATE VALUES VARCHAR VARCHAR2 VIEW WHENEVER WHERE WITH`.trim().split(/\s+/),
  );

  /** @param {string} name */
  const isReserved = (name) => RESERVED.has(name.toUpperCase());

  /** Nome pronto para o SQL: palavras reservadas vão entre aspas, em maiúsculas. */
  const ident = (name) => (isReserved(name) ? `"${name.toUpperCase()}"` : name);

  /** @param {string[]} names */
  const identList = (names) => names.map(ident).join(', ');

  DDL.ident = { isReserved, ident, identList };
})((globalThis.DDL = globalThis.DDL || {}));
