import {
	BadRequestException,
	Injectable,
	NotFoundException,
	UnauthorizedException
} from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { PrismaService } from 'src/prisma.service'
import { UserService } from 'src/user/user.service'
import { AuthDto } from './dto/auth.dto'
import { Response } from 'express'
import { ConfigService } from '@nestjs/config'

@Injectable()
export class AuthService {
	EXPIRE_DAY_REFRESH_TOKEN = 1
	REFRESH_TOKEN_COOKIE_NAME = 'refreshToken'

	constructor(
		private jwt: JwtService,
		private userService: UserService,
		private prisma: PrismaService,
		private configService: ConfigService
	) {}

	async login(dto: AuthDto) {
		const user = await this.validateUser(dto)
		const tokens = this.issueTokens(user.id)

		return { user, ...tokens }
	}

	async register(dto: AuthDto) {
		const existUser = await this.userService.getByEmail(dto.email)

		if (existUser) {
			throw new NotFoundException('Пользователь с таким email уже существует')
		}

		const user = await this.userService.create(dto)
		const tokens = this.issueTokens(user.id)

		return { user, ...tokens }
	}

	async getNewTokens(refreshToken: string) {
		const result = await this.jwt.verifyAsync(refreshToken)

		if (!result) {
			throw new UnauthorizedException('Невалидный токен')
		}

		const user = await this.userService.getById(result.id)

		if (!user) {
			throw new BadRequestException('Пользователь не найден.')
		}

		const tokens = this.issueTokens(user.id)

		return { user, ...tokens }
	}

	issueTokens(userId: string) {
		const data = { id: userId }

		const accessToken = this.jwt.sign(data, {
			expiresIn: '1h'
		})

		const refreshToken = this.jwt.sign(data, {
			expiresIn: '7d'
		})

		return {
			accessToken,
			refreshToken
		}
	}

	private async validateUser(dto: AuthDto) {
		const user = await this.userService.getByEmail(dto.email)

		if (!user) {
			throw new NotFoundException('Пользователь не найден')
		}

		return user
	}

	async validateOAuthLogin(req: any) {
		let user = await this.userService.getByEmail(req.user.email)

		if (!user) {
			user = await this.prisma.user.create({
				data: {
					updatedAt: new Date(),
					email: req.user.email,
					name: req.user.name,
					picture: req.user.picture
				},
				include: {
					stores: true,
					favorites: true,
					orders: true
				}
			})

			if (!user) {
				throw new Error('Не удалось создать пользователя.')
			}
		}

		const tokens = this.issueTokens(user.id)

		return { user, ...tokens }
	}

	addRefreshTokenToResponse(res: Response, refreshToken: string) {
		const expiresIn = new Date()
		expiresIn.setDate(expiresIn.getDate() + this.EXPIRE_DAY_REFRESH_TOKEN)

		res.cookie(this.REFRESH_TOKEN_COOKIE_NAME, refreshToken, {
			httpOnly: true,
			domain: this.configService.get('SERVER_DOMAIN'),
			expires: expiresIn,
			secure: true,
			sameSite: 'none'
		})
	}

	RemoveRefreshTokenToResponse(res: Response) {
		const domain = this.configService.get('SERVER_DOMAIN')

		res.cookie(this.REFRESH_TOKEN_COOKIE_NAME, '', {
			// Устанавливаем значение в пустую строку
			httpOnly: true,
			domain: domain,
			expires: new Date(0), // Устанавливаем дату истечения в прошлое
			secure: true,
			sameSite: 'none'
		})
	}
}
