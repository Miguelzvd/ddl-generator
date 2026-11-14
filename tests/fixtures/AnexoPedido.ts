import { ViewEntity, ViewColumn } from "typeorm"

@ViewEntity("ANEXO_PEDIDO_V")
export class AnexoPedido {

	@ViewColumn({ name: "ID_ANEXO" })
	idAnexo: number;

	@ViewColumn({ name: "ID_PEDIDO" })
	idPedido: number;

	@ViewColumn({ name: "DT_ANEXO" })
	dtAnexo: Date;

	@ViewColumn({ name: "DS_ANEXO" })
	dsAnexo: string;

	@ViewColumn({ name: "DT_ATUALIZACAO" })
	dtAtualizacao: Date;

	@ViewColumn({ name: "NM_USUARIO" })
	nmUsuario: string;
}
