# Test - Subnet Calculator Plugin

## Esempio 1: Classe C Standard

```subnet
net: 192.168.0.0/24
plan:
  - /26
  - /26
  - /26
  - /26
```

## Esempio 2: Rete più grande

```subnet
net: 172.16.0.0/16
plan:
  - /18
  - /18
  - /19
  - /19
  - /20
```

## Esempio 3: Subnetting VLSM

```subnet
net: 10.0.0.0/8
plan:
  - /10
  - /11
  - /12
  - /13
  - /14
```
