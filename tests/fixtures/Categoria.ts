import { Column, Entity, PrimaryGeneratedColumn } from "typeorm";

@Entity('CATEGORIA')
export class Categoria {

    @PrimaryGeneratedColumn({name: 'ID_CATEGORIA'})
    idCategoria: number

    @Column('varchar2', {name: 'NOME_CATEGORIA'})
    nomeCategoria: string

    @Column('timestamp', {name: 'CREATED_AT'})
    createdAt: Date

    @Column('timestamp', {name: 'UPDATED_AT'})
    updatedAt: Date

    @Column('timestamp', {name: 'DELETED_AT'})
    deletedAt: Date

}
