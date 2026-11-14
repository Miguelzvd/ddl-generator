import { ViewEntity, ViewColumn, ManyToOne, JoinColumn, PrimaryGeneratedColumn } from "typeorm"
import { ClienteResumoV } from "./ClienteResumoV";

@ViewEntity("PEDIDO_V")
export class PedidoV {

  @PrimaryGeneratedColumn({ name: "ID_CLIENTE" })
  idCliente: number;

  @ViewColumn({ name: "CODIGO" })
  codigo: number;

  @ViewColumn({ name: "DESCRICAO" })
  descricao: string;

  @ViewColumn({ name: "PRINCIPAL" })
  principal: string;

  @ManyToOne(() => ClienteResumoV, (cliente) => cliente.pedidos)
  @JoinColumn({ name: 'ID_CLIENTE' })
  cliente: ClienteResumoV;

}
