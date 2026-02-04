import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserRole } from '../schemas/user.schema';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class AuthService implements OnModuleInit {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectModel(User.name) private userModel: Model<User>,
    private configService: ConfigService,
  ) {}

  async onModuleInit() {
    await this.seedAdminUser();
  }

  private async seedAdminUser() {
    const adminEmail = this.configService.get<string>('ADMIN_EMAIL');
    if (!adminEmail) {
      this.logger.warn('ADMIN_EMAIL no definido en variables de entorno. Omitiendo seed.');
      return;
    }

    const existingAdmin = await this.userModel.findOne({ email: adminEmail });
    if (!existingAdmin) {
      this.logger.log(`Creando usuario administrador inicial: ${adminEmail}`);
      await this.userModel.create({
        email: adminEmail,
        firstName: 'Admin',
        lastName: 'System',
        role: UserRole.ADMIN,
        isActive: true,
        picture: `https://ui-avatars.com/api/?name=Admin+System&background=4f46e5&color=fff`,
      });
    } else if (existingAdmin.role !== UserRole.ADMIN) {
      this.logger.log(`Asegurando rol ADMIN para: ${adminEmail}`);
      existingAdmin.role = UserRole.ADMIN;
      await existingAdmin.save();
    }
  }

  async validateUser(details: any) {
    const user = await this.userModel.findOne({ email: details.email });
    
    // Si el usuario existe, podemos actualizar su info (picture, etc)
    if (user) {
      user.firstName = details.firstName || user.firstName;
      user.lastName = details.lastName || user.lastName;
      user.picture = details.picture || user.picture;
      // Forzar ADMIN si coincide con ADMIN_EMAIL incluso si entra vía Google por primera vez
      const adminEmail = this.configService.get<string>('ADMIN_EMAIL');
      if (user.email === adminEmail) {
        user.role = UserRole.ADMIN;
      }
      await user.save();
      return user;
    }

    // Si es el usuario definido en ADMIN_EMAIL hacerlo ADMIN automáticamente
    const adminEmail = this.configService.get<string>('ADMIN_EMAIL');
    const role = (adminEmail && details.email === adminEmail) ? UserRole.ADMIN : UserRole.VIEWER;

    const newUser = new this.userModel({
      ...details,
      role,
    });
    return newUser.save();
  }

  async findUserByEmail(email: string) {
    return this.userModel.findOne({ email });
  }

  async getAllUsers() {
    return this.userModel.find().sort({ createdAt: -1 });
  }

  async updateUserRole(id: string, role: UserRole) {
    return this.userModel.findByIdAndUpdate(id, { role }, { new: true });
  }

  async createUser(data: any) {
    const existing = await this.userModel.findOne({ email: data.email });
    if (existing) {
      throw new Error('El usuario ya existe');
    }
    return this.userModel.create({
      ...data,
      picture: data.picture || `https://ui-avatars.com/api/?name=${data.firstName}+${data.lastName}&background=random`
    });
  }

  async updateUser(id: string, data: any) {
    return this.userModel.findByIdAndUpdate(id, data, { new: true });
  }

  async toggleUserStatus(id: string) {
    const user = await this.userModel.findById(id);
    if (!user) {
      throw new Error('Usuario no encontrado');
    }
    user.isActive = !user.isActive;
    return user.save();
  }

  async deleteUser(id: string) {
    return this.userModel.findByIdAndDelete(id);
  }
}
