import type {
  ApplicationEventType as SharedApplicationEventType,
  ApplicationStatus as SharedApplicationStatus,
  ContractType as SharedContractType,
  DocumentType as SharedDocumentType,
} from '@jobtracker/shared';
import type {
  ApplicationEventType as PrismaApplicationEventType,
  ApplicationStatus as PrismaApplicationStatus,
  ContractType as PrismaContractType,
  DocumentType as PrismaDocumentType,
} from '../../generated/prisma/enums';

type Equal<Left, Right> =
  (<Value>() => Value extends Left ? 1 : 2) extends <
    Value,
  >() => Value extends Right ? 1 : 2
    ? (<Value>() => Value extends Right ? 1 : 2) extends <
        Value,
      >() => Value extends Left ? 1 : 2
      ? true
      : false
    : false;

const contractsMatch = {
  applicationStatus: true,
  applicationEventType: true,
  contractType: true,
  documentType: true,
} satisfies {
  applicationStatus: Equal<SharedApplicationStatus, PrismaApplicationStatus>;
  applicationEventType: Equal<
    SharedApplicationEventType,
    PrismaApplicationEventType
  >;
  contractType: Equal<SharedContractType, PrismaContractType>;
  documentType: Equal<SharedDocumentType, PrismaDocumentType>;
};

describe('shared API contracts', () => {
  it('keeps shared enums aligned with Prisma enums', () => {
    expect(contractsMatch).toEqual({
      applicationStatus: true,
      applicationEventType: true,
      contractType: true,
      documentType: true,
    });
  });
});
