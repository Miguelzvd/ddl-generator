import { ViewEntity, ViewColumn, OneToMany, JoinColumn, PrimaryGeneratedColumn } from "typeorm"
import { PedidoV } from "./PedidoV";

@ViewEntity("CLIENTE_RESUMO_V")
export class ClienteResumoV {

	@PrimaryGeneratedColumn({ name: "ID_CLIENTE" })
	idCliente: number;

	@ViewColumn({ name: "ID_GRUPO" })
	idGrupo: number;

	@ViewColumn({ name: "DOCUMENTO" })
	documento: string;

	@ViewColumn({ name: "NOME" })
	nome: string;

	@ViewColumn({ name: "EMAIL" })
	email: string;

	@ViewColumn({ name: "UF" })
	uf: string;

	@ViewColumn({ name: "DT_NASCIMENTO" })
	dtNascimento: string | null;

	@ViewColumn({ name: "TELEFONE" })
	telefone: string;

	@ViewColumn({ name: "CIDADE" })
	cidade: string;

	@OneToMany(() => PedidoV, (pedido) => pedido.cliente, { eager: true, cascade: true })
	@JoinColumn({ name: 'ID_CLIENTE' })
	pedidos: PedidoV[];
}
