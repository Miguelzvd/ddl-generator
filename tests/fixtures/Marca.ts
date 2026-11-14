import { Column, Entity, PrimaryGeneratedColumn } from "typeorm";

@Entity('MARCA')
export class Marca {

    @PrimaryGeneratedColumn({name: 'COD_MARCA'})
    codMarca: number

    @Column('varchar2', {name: 'NOME_MARCA'})
    nomeMarca: string

    @Column('timestamp', {name: 'CREATED_AT'})
    createdAt: Date

    @Column('timestamp', {name: 'UPDATED_AT'})
    updatedAt: Date

    @Column('timestamp', {name: 'DELETED_AT'})
    deletedAt: Date

}
