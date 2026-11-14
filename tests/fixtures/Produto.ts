import { Column, Entity, JoinColumn, OneToOne, PrimaryGeneratedColumn } from "typeorm";
import { Categoria } from "./Categoria";
import { Marca } from "./Marca";

@Entity('PRODUTO')
export class Produto {

    @PrimaryGeneratedColumn({name: 'ID_PRODUTO'})
    idProduto: number

    @Column('varchar2', {name: 'NOME'})
    nome: string

    @Column('varchar2', {name: 'SKU'})
    sku: string

    @Column('varchar2', {name: 'ID_CATEGORIA'})
    idCategoria: number

    @Column('varchar2', {name: 'DESCRICAO'})
    descricao: string

    @Column('varchar2', {name: 'ID_MARCA'})
    idMarca: number

    @Column({name: 'STATUS'})
    status: number

    @Column('varchar2', {name: 'IMAGEM'})
    imagem: string

    @Column('varchar2', {name: 'ARQUIVO_IMAGEM'})
    arquivoImagem: string

    @Column('varchar2', {name: 'THUMB'})
    thumb: string

    @Column('varchar2', {name: 'ARQUIVO_THUMB'})
    arquivoThumb: string

    @Column('varchar2', {name: 'PRIORIDADE'})
    prioridade: number

    @Column('timestamp', {name: 'CREATED_AT'})
    createdAt: Date

    @Column('timestamp', {name: 'UPDATED_AT'})
    updatedAt: Date

    @Column('timestamp', {name: 'DELETED_AT'})
    deletedAt: Date

    @OneToOne((type) => Categoria, { eager:true })
    @JoinColumn({name: 'ID_CATEGORIA'})
    categoria: Categoria

    @OneToOne((type) => Marca, { eager:true })
    @JoinColumn({name: 'ID_MARCA'})
    marca: Marca

}
