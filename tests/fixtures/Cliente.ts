import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity({ schema: 'LOJA', name: 'CLIENTE', synchronize: false })
export class Cliente {
    // Identificador lógico exigido pelo ORM.
    @PrimaryColumn({ name: 'ID_CLIENTE', type: 'number' })
    idCliente: number;

    @Column({ name: 'ID_GRUPO', type: 'number', nullable: true })
    idGrupo: number;

    @Column({ name: 'NOME', type: 'varchar2', length: 255, nullable: true })
    nome: string;

    @Column({ name: 'CIDADE', type: 'varchar2', length: 60, nullable: true })
    cidade: string;

    @Column({ name: 'UF', type: 'varchar2', length: 2, nullable: true })
    uf: string;

    @Column({ name: 'DOCUMENTO', type: 'varchar2', length: 14, nullable: true })
    documento: string;

    @Column({ name: 'COD_SEGMENTO', type: 'number', nullable: true })
    codSegmento: number | null;

    @Column({ name: 'ATIVO', type: 'number' })
    ativo: number;

    @Column({ name: 'DATA_CADASTRO', type: 'date', default: () => 'SYSDATE' })
    dataCadastro: Date;
}
